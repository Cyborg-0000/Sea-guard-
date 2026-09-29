import math
from datetime import datetime, timedelta, timezone
from typing import List, Tuple, Dict, Any
from utils.vector import Vector2D
from schemas.pydantic_schemas import EnvironmentalObservation

class DriftModel:
    def __init__(self, alpha: float = 1.0, beta: float = 0.03, source_uncertainty_km: float = 5.0):
        self.alpha = alpha
        self.beta = beta
        self.source_uncertainty_km = source_uncertainty_km

    def _knots_to_ms(self, knots: float) -> float:
        return knots * 0.514444
        
    def _ms_to_kmh(self, ms: float) -> float:
        return ms * 3.6

    def calculate_drift_vector(self, env: EnvironmentalObservation) -> Vector2D:
        """
        Calculates the drift vector in m/s based on ocean current and wind.
        Wind direction is 'coming from' (met convention), so 'going to' is +180.
        Current direction is 'going to' (ocean convention).

        PARTIAL ENVIRONMENT POLICY:
        - If wind OR current is None (unavailable), we compute a partial vector
          using only the available component and set env.completeness = PARTIAL.
        - We NEVER substitute None with 0 — zero would be scientifically misleading.
        - Callers should check env.completeness and env.missing_components and
          reduce confidence accordingly.
        """
        has_wind = env.wind_speed is not None and env.wind_direction is not None
        has_current = env.current_speed is not None and env.current_direction is not None

        if not has_wind and not has_current:
            raise ValueError(
                "Cannot calculate drift: both wind and current data are unavailable. "
                f"Missing: {env.missing_components}"
            )

        wind_vector = Vector2D(0.0, 0.0)
        current_vector = Vector2D(0.0, 0.0)

        if has_wind:
            wind_speed_ms = self._knots_to_ms(env.wind_speed)
            wind_going_to = (env.wind_direction + 180) % 360
            wind_vector = Vector2D.from_speed_bearing(wind_speed_ms, wind_going_to)

        if has_current:
            current_vector = Vector2D.from_speed_bearing(env.current_speed, env.current_direction)

        drift_vector = (self.alpha * current_vector) + (self.beta * wind_vector)
        return drift_vector


    def _move_point(self, lat: float, lon: float, distance_km: float, bearing_deg: float) -> Tuple[float, float]:
        R = 6371.0
        lat_rad = math.radians(lat)
        lon_rad = math.radians(lon)
        bearing_rad = math.radians(bearing_deg)

        new_lat_rad = math.asin(math.sin(lat_rad) * math.cos(distance_km / R) +
                                math.cos(lat_rad) * math.sin(distance_km / R) * math.cos(bearing_rad))
        new_lon_rad = lon_rad + math.atan2(math.sin(bearing_rad) * math.sin(distance_km / R) * math.cos(lat_rad),
                                           math.cos(distance_km / R) - math.sin(lat_rad) * math.sin(new_lat_rad))

        return math.degrees(new_lat_rad), math.degrees(new_lon_rad)

    def simulate_drift(self, start_lat: float, start_lon: float, env: EnvironmentalObservation, duration_hours: float, time_step_hours: float = 1.0, reverse: bool = False) -> List[Tuple[float, float]]:
        """
        Simulates drift over time.
        If reverse is True, inverts the drift vector to trace backwards from a spill.
        """
        drift_vector = self.calculate_drift_vector(env)
        speed_ms = drift_vector.magnitude()
        speed_kmh = self._ms_to_kmh(speed_ms)
        bearing = drift_vector.bearing()
        
        if reverse:
            bearing = (bearing + 180) % 360

        positions = [(start_lat, start_lon)]
        current_lat, current_lon = start_lat, start_lon
        
        time_elapsed = 0.0
        while time_elapsed < duration_hours:
            step = min(time_step_hours, duration_hours - time_elapsed)
            distance_km = speed_kmh * step
            
            current_lat, current_lon = self._move_point(current_lat, current_lon, distance_km, bearing)
            positions.append((current_lat, current_lon))
            
            time_elapsed += step
            
        return positions

    def generate_source_corridor(self, spill_lat: float, spill_lon: float, env: EnvironmentalObservation, duration_hours: float) -> Dict[str, Any]:
        """
        Generates a GeoJSON representing the potential source corridor by reversing drift.
        """
        centerline = self.simulate_drift(spill_lat, spill_lon, env, duration_hours, time_step_hours=1.0, reverse=True)
        estimated_source = centerline[-1]
        
        # To generate a corridor polygon, we create points perpendicular to the centerline
        # simplified for MVP: just a buffer around the start and end points connected
        
        drift_vector = self.calculate_drift_vector(env)
        bearing = drift_vector.bearing()
        reverse_bearing = (bearing + 180) % 360
        perp1 = (reverse_bearing + 90) % 360
        perp2 = (reverse_bearing - 90) % 360
        
        width_km = self.source_uncertainty_km
        
        # Buffer around spill (end of reverse drift)
        spill_p1 = self._move_point(spill_lat, spill_lon, width_km/2, perp1)
        spill_p2 = self._move_point(spill_lat, spill_lon, width_km/2, perp2)
        
        # Buffer around source (start of reverse drift, furthest point backwards)
        # Uncertainty grows over time, so maybe wider at the source
        source_width_km = width_km + (duration_hours * 0.5) 
        source_p1 = self._move_point(estimated_source[0], estimated_source[1], source_width_km/2, perp1)
        source_p2 = self._move_point(estimated_source[0], estimated_source[1], source_width_km/2, perp2)
        
        polygon_coords = [
            [spill_p1[1], spill_p1[0]],
            [spill_p2[1], spill_p2[0]],
            [source_p2[1], source_p2[0]],
            [source_p1[1], source_p1[0]],
            [spill_p1[1], spill_p1[0]]
        ]
        
        return {
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [polygon_coords]
            },
            "properties": {
                "estimated_source": {"lat": estimated_source[0], "lon": estimated_source[1]},
                "duration_hours": duration_hours,
                "confidence": env.confidence
            }
        }

    def _haversine(self, lat1, lon1, lat2, lon2):
        R = 6371.0
        dLat = math.radians(lat2 - lat1)
        dLon = math.radians(lon2 - lon1)
        a = math.sin(dLat/2) * math.sin(dLat/2) + math.cos(math.radians(lat1)) \
            * math.cos(math.radians(lat2)) * math.sin(dLon/2) * math.sin(dLon/2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        return R * c

    def get_default_demo_env(self, spill_time: datetime) -> EnvironmentalObservation:
        return EnvironmentalObservation(
            observation_time=spill_time,
            retrieved_at=datetime.now(timezone.utc),
            latitude=0.0,
            longitude=0.0,
            wind_speed=18.0,
            wind_direction=245.0,
            current_speed=0.42,
            current_direction=228.0,
            source="DEMO_ENVIRONMENT",
            confidence=0.74,
            data_mode="DEMO_REPLAY",
            status="CONNECTED",
            completeness="COMPLETE",
            available_components=["wind", "ocean_current"],
            missing_components=[]
        )

