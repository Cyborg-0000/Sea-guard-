import httpx
from datetime import datetime, timezone
import concurrent.futures
from typing import Dict, Any, Optional, Tuple

from adapters.base import BaseEnvironmentAdapter
from schemas.pydantic_schemas import EnvironmentalObservation as PydanticEnvObs

class OpenMeteoAdapter(BaseEnvironmentAdapter):
    def __init__(self):
        self.weather_url = "https://api.open-meteo.com/v1/forecast"
        self.marine_url = "https://marine-api.open-meteo.com/v1/marine"
        self._health_status = "CONNECTED"
        self._cache: Dict[str, PydanticEnvObs] = {}
        # Cache for live requests to avoid spamming slider
        self._live_cache: Dict[str, Tuple[datetime, PydanticEnvObs]] = {}

    @property
    def health_status(self) -> str:
        return self._health_status

    def _fetch_url(self, url: str, params: dict) -> dict:
        import time
        max_retries = 3
        backoff_factor = 2.0
        
        for attempt in range(max_retries):
            try:
                with httpx.Client(timeout=10.0) as client:
                    response = client.get(url, params=params)
                    response.raise_for_status()
                    return response.json()
            except httpx.HTTPError as e:
                if attempt == max_retries - 1:
                    print(f"[OpenMeteo] Request failed after {max_retries} attempts: {e}")
                    raise
                
                sleep_time = backoff_factor ** attempt
                print(f"[OpenMeteo] Transient error {e}. Retrying in {sleep_time}s...")
                time.sleep(sleep_time)

    def _get_cache_key(self, lat: float, lon: float, timestamp: Optional[datetime]) -> str:
        ts_str = timestamp.isoformat() if timestamp else "LIVE"
        # round to 2 decimal places to cache nearby slider requests
        return f"{lat:.2f}_{lon:.2f}_{ts_str}"

    def _fetch_concurrently(self, weather_params: dict, marine_params: dict) -> tuple:
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            future_w = executor.submit(self._fetch_url, self.weather_url, weather_params)
            future_m = executor.submit(self._fetch_url, self.marine_url, marine_params)

            weather_data = None
            marine_data = None
            
            try:
                weather_data = future_w.result()
            except Exception as e:
                print(f"Weather API failed: {e}")
                
            try:
                marine_data = future_m.result()
            except Exception as e:
                print(f"Marine API failed: {e}")
                
            return weather_data, marine_data

    def _process_response(self, weather_data: dict, marine_data: dict, is_live: bool, requested_time: datetime) -> PydanticEnvObs:
        if not weather_data and not marine_data:
            self._health_status = "UNAVAILABLE"
            raise RuntimeError("Both Weather and Marine APIs are unavailable")

        retrieved_at = datetime.now(timezone.utc)
        data_mode = "LIVE" if is_live else "HISTORICAL"

        # --- Extract wind (weather API) ---
        wind_speed: Optional[float] = None
        wind_dir: Optional[float] = None
        observation_time: Optional[datetime] = None
        lat_out: Optional[float] = None
        lon_out: Optional[float] = None

        if weather_data:
            try:
                if is_live:
                    obs_str = weather_data['current']['time']
                    observation_time = datetime.fromisoformat(obs_str).replace(tzinfo=timezone.utc)
                    wind_speed = float(weather_data['current']['wind_speed_10m'])
                    wind_dir = float(weather_data['current']['wind_direction_10m'])
                else:
                    w_times = [datetime.fromisoformat(t).replace(tzinfo=timezone.utc) for t in weather_data['hourly']['time']]
                    w_idx = min(range(len(w_times)), key=lambda i: abs((w_times[i] - requested_time).total_seconds()))
                    observation_time = w_times[w_idx]
                    wind_speed = float(weather_data['hourly']['wind_speed_10m'][w_idx])
                    wind_dir = float(weather_data['hourly']['wind_direction_10m'][w_idx])
                lat_out = weather_data.get('latitude', requested_time)
                lon_out = weather_data.get('longitude', 0.0)
                lat_out = weather_data['latitude']
                lon_out = weather_data['longitude']
            except (KeyError, ValueError, TypeError) as e:
                print(f"[OpenMeteo] Weather parse error: {e}")
                wind_speed = None
                wind_dir = None

        # --- Extract ocean current (marine API) ---
        current_speed_ms: Optional[float] = None
        current_dir: Optional[float] = None

        if marine_data:
            try:
                if is_live:
                    current_speed_kmh = float(marine_data['current']['ocean_current_velocity'])
                    current_dir = float(marine_data['current']['ocean_current_direction'])
                else:
                    m_times = [datetime.fromisoformat(t).replace(tzinfo=timezone.utc) for t in marine_data['hourly']['time']]
                    m_idx = min(range(len(m_times)), key=lambda i: abs((m_times[i] - requested_time).total_seconds()))
                    current_speed_kmh = float(marine_data['hourly']['ocean_current_velocity'][m_idx])
                    current_dir = float(marine_data['hourly']['ocean_current_direction'][m_idx])
                current_speed_ms = current_speed_kmh / 3.6  # km/h → m/s
                if lat_out is None and marine_data:
                    lat_out = marine_data.get('latitude', 0.0)
                    lon_out = marine_data.get('longitude', 0.0)
            except (KeyError, ValueError, TypeError) as e:
                print(f"[OpenMeteo] Marine parse error: {e}")
                current_speed_ms = None
                current_dir = None

        # Fall back observation time if weather failed
        if observation_time is None:
            observation_time = requested_time if requested_time else datetime.now(timezone.utc)
        if lat_out is None:
            lat_out = 0.0
            lon_out = 0.0

        # --- Build completeness metadata ---
        available: list = []
        missing: list = []
        if wind_speed is not None:
            available.append("wind")
        else:
            missing.append("wind")
        if current_speed_ms is not None:
            available.append("ocean_current")
        else:
            missing.append("ocean_current")

        is_partial = bool(missing)
        if is_partial:
            self._health_status = "DEGRADED"
            confidence = 0.4
            status = "DEGRADED"
            completeness = "PARTIAL"
        else:
            self._health_status = "CONNECTED"
            confidence = 0.9
            status = "CONNECTED"
            completeness = "COMPLETE"

        return PydanticEnvObs(
            observation_time=observation_time,
            retrieved_at=retrieved_at,
            latitude=lat_out,
            longitude=lon_out,
            wind_speed=wind_speed,
            wind_direction=wind_dir,
            current_speed=current_speed_ms,
            current_direction=current_dir,
            source="OPEN_METEO",
            confidence=confidence,
            data_mode=data_mode,
            status=status,
            completeness=completeness,
            available_components=available,
            missing_components=missing,
        )




    def fetch_environment(self, lat: float, lon: float, timestamp: datetime) -> PydanticEnvObs:
        cache_key = self._get_cache_key(lat, lon, timestamp)
        if cache_key in self._cache:
            return self._cache[cache_key]
            
        date_str = timestamp.strftime('%Y-%m-%d')
        
        weather_params = {
            "latitude": lat,
            "longitude": lon,
            "start_date": date_str,
            "end_date": date_str,
            "hourly": "wind_speed_10m,wind_direction_10m",
            "wind_speed_unit": "kn"
        }
        marine_params = {
            "latitude": lat,
            "longitude": lon,
            "start_date": date_str,
            "end_date": date_str,
            "hourly": "ocean_current_velocity,ocean_current_direction"
        }
        
        w_data, m_data = self._fetch_concurrently(weather_params, marine_params)
        obs = self._process_response(w_data, m_data, is_live=False, requested_time=timestamp)
        self._cache[cache_key] = obs
        return obs

    def fetch_live_environment(self, lat: float, lon: float) -> PydanticEnvObs:
        cache_key = self._get_cache_key(lat, lon, None)
        
        # 5 minute TTL for live cache
        if cache_key in self._live_cache:
            cached_time, cached_obs = self._live_cache[cache_key]
            if (datetime.now(timezone.utc) - cached_time).total_seconds() < 300:
                return cached_obs
        
        weather_params = {
            "latitude": lat,
            "longitude": lon,
            "current": "wind_speed_10m,wind_direction_10m",
            "wind_speed_unit": "kn"
        }
        marine_params = {
            "latitude": lat,
            "longitude": lon,
            "current": "ocean_current_velocity,ocean_current_direction"
        }
        
        w_data, m_data = self._fetch_concurrently(weather_params, marine_params)
        obs = self._process_response(w_data, m_data, is_live=True, requested_time=datetime.now(timezone.utc))
        self._live_cache[cache_key] = (datetime.now(timezone.utc), obs)
        return obs
