"""
AISStreamAdapter — Live AIS via AISStream.io WebSocket

MANDATORY ARCHITECTURE:
  AISStream WebSocket -> AISStreamAdapter -> Backend Registry -> FastAPI WebSocket -> Frontend
"""
import json
import os
import threading
import time
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Tuple, Dict, Any

from adapters.base import BaseAISAdapter
from schemas.pydantic_schemas import Vessel as PydanticVessel, VesselPosition as PydanticVesselPosition

MAX_TRACK_POINTS = 500
STALE_TIMEOUT_SECONDS = 3600  # 1 hour

class AISStreamAdapter(BaseAISAdapter):
    def __init__(self):
        # Single backend registry keyed by MMSI
        self.registry: Dict[str, dict] = {}
        
        self._last_valid_update: Optional[datetime] = None
        self._health_status = "UNAVAILABLE"
        self._ws_thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._persistence_health = "OK"
        self._connected = False
        self._subscription_confirmed = False
        
        # Diagnostics
        self.stats = {
            "messages_received": 0,
            "position_reports": 0,
            "static_reports": 0,
            "unknown_messages": 0,
            "last_error": None
        }

        api_key = os.environ.get("AISSTREAM_API_KEY", "")
        if api_key:
            self._start_streaming(api_key)
        else:
            print("[AISStream] No AISSTREAM_API_KEY set. Adapter in UNAVAILABLE state.")

    @property
    def health_status(self) -> str:
        if self._connected and self._subscription_confirmed and self._last_valid_update:
            age = (datetime.now(timezone.utc) - self._last_valid_update).total_seconds()
            if age < 300:
                return "CONNECTED"
            return "DEGRADED"
        return "UNAVAILABLE"

    @property
    def last_update(self) -> Optional[datetime]:
        return self._last_valid_update

    @property
    def persistence_status(self) -> str:
        return self._persistence_health

    @property
    def vessels_tracked(self) -> int:
        with self._lock:
            return len(self.registry)

    def get_diagnostic_stats(self) -> dict:
        with self._lock:
            tankers = 0
            active_tankers = 0
            stale_tankers = 0
            now = datetime.now(timezone.utc)
            sample_tanker = None

            # Clean stale vessels during stats check
            to_remove = []
            for mmsi, vessel in self.registry.items():
                is_tanker = vessel["is_tanker"]
                last_up = vessel["last_update"]
                age = (now - last_up).total_seconds()
                
                if age > STALE_TIMEOUT_SECONDS:
                    to_remove.append(mmsi)
                    continue

                if is_tanker:
                    tankers += 1
                    if age < 600:
                        active_tankers += 1
                        if not sample_tanker:
                            sample_tanker = vessel
                    else:
                        stale_tankers += 1

            for mmsi in to_remove:
                del self.registry[mmsi]

            lat_min = float(os.environ.get("AIS_BBOX_LAT_MIN", "49.0"))
            lat_max = float(os.environ.get("AIS_BBOX_LAT_MAX", "52.0"))
            lon_min = float(os.environ.get("AIS_BBOX_LON_MIN", "-5.0"))
            lon_max = float(os.environ.get("AIS_BBOX_LON_MAX", "3.0"))

            return {
                "stream_connected": self._connected,
                "subscription_confirmed": self._subscription_confirmed,
                "configured_bboxes": [[ [lat_min, lon_min], [lat_max, lon_max] ]],
                "last_message_at": self._last_valid_update.isoformat() if self._last_valid_update else None,
                "last_error": self.stats["last_error"],
                "total_messages": self.stats["messages_received"],
                "position_reports": self.stats["position_reports"],
                "static_reports": self.stats["static_reports"],
                "unknown_messages": self.stats["unknown_messages"],
                "registry_size": len(self.registry),
                "vessel_type_counts": {k: len([v for v in self.registry.values() if v.get("ais_type_code") == k]) for k in set([v.get("ais_type_code") for v in self.registry.values()])},
                "tankers_80_89": tankers,
                "active_tankers": active_tankers,
                "stale_tankers": stale_tankers,
                "sample_tanker": sample_tanker
            }

    # ------------------------------------------------------------------
    # BaseAISAdapter interface (legacy support for endpoints)
    # ------------------------------------------------------------------
    def fetch_positions(self, bbox: List[float], time_range: Tuple) -> List[PydanticVesselPosition]:
        # Legacy stub
        return []

    def fetch_vessels(self, vessel_ids: List[str]) -> List[PydanticVessel]:
        # Legacy stub
        return []

    def stream_positions(self, bbox: List[float]):
        pass

    # ------------------------------------------------------------------
    # WebSocket Client
    # ------------------------------------------------------------------
    def _start_streaming(self, api_key: str):
        self._ws_thread = threading.Thread(
            target=self._run_ws_client,
            args=(api_key,),
            daemon=True,
            name="aisstream-ws",
        )
        self._ws_thread.start()
        print("[AISStream] WebSocket thread started.")

    def _build_subscription_message(self, api_key: str) -> dict:
        lat_min = float(os.environ.get("AIS_BBOX_LAT_MIN", "49.0"))
        lat_max = float(os.environ.get("AIS_BBOX_LAT_MAX", "52.0"))
        lon_min = float(os.environ.get("AIS_BBOX_LON_MIN", "-5.0"))
        lon_max = float(os.environ.get("AIS_BBOX_LON_MAX", "3.0"))

        return {
            "APIKey": api_key,
            "BoundingBoxes": [[
                [lat_min, lon_min],
                [lat_max, lon_max]
            ]],
            "FilterMessageTypes": ["PositionReport", "ShipStaticData"],
        }

    def _run_ws_client(self, api_key: str):
        try:
            import websocket
        except ImportError:
            print("[AISStream] websocket-client not installed.")
            self._health_status = "UNAVAILABLE"
            return

        url = "wss://stream.aisstream.io/v0/stream"
        sub_msg = json.dumps(self._build_subscription_message(api_key))
        
        backoff_ladder = [1, 2, 4, 8, 16, 30]
        backoff_idx = 0

        while True:
            def on_open(ws):
                print(f"[AISStream] Connected to {url}. Sending subscription...")
                self._connected = True
                self._health_status = "OK"
                ws.send(sub_msg)

            def on_message(ws, message):
                try:
                    data = json.loads(message)
                    self._handle_message(data)
                except Exception as e:
                    print(f"[AISStream] JSON parse error: {e}")

            def on_error(ws, error):
                print(f"[AISStream] WebSocket error: {error}")
                self._connected = False
                self._subscription_confirmed = False
                self.stats["last_error"] = str(error)

            def on_close(ws, code, reason):
                print(f"[AISStream] Connection closed ({code}): {reason}")
                self._connected = False
                self._subscription_confirmed = False

            ws_app = websocket.WebSocketApp(
                url,
                on_open=on_open,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close,
            )
            
            ws_app.run_forever()
            
            sleep_time = backoff_ladder[backoff_idx]
            backoff_idx = min(backoff_idx + 1, len(backoff_ladder) - 1)
            print(f"[AISStream] Reconnecting in {sleep_time}s...")
            time.sleep(sleep_time)

    def _handle_message(self, data: dict):
        self.stats["messages_received"] += 1
        msg_type = data.get("MessageType", "")

        if msg_type == "SubscriptionConfirmation":
            self._subscription_confirmed = True
            print("[AISStream] Subscription confirmed.")
        elif msg_type == "PositionReport":
            self.stats["position_reports"] += 1
            self._handle_position_report(data)
        elif msg_type == "ShipStaticData":
            self.stats["static_reports"] += 1
            self._handle_static_data(data)
        else:
            self.stats["unknown_messages"] += 1

    def _get_or_create_vessel(self, mmsi: str) -> dict:
        if mmsi not in self.registry:
            self.registry[mmsi] = {
                "mmsi": mmsi,
                "name": "UNKNOWN",
                "imo": None,
                "ais_type_code": None,
                "classification": "UNCLASSIFIED",
                "is_tanker": False,
                "destination": "NOT AVAILABLE",
                "latitude": 0.0,
                "longitude": 0.0,
                "sog": 0.0,
                "cog": 0.0,
                "heading": None,
                "timestamp": None,
                "last_update": datetime.now(timezone.utc),
                "track": []
            }
        return self.registry[mmsi]

    def _handle_position_report(self, data: dict):
        meta = data.get("MetaData", {})
        msg = data.get("Message", {}).get("PositionReport", {})

        mmsi = str(meta.get("MMSI", ""))
        if not mmsi:
            return

        lat = float(msg.get("Latitude", 0))
        lon = float(msg.get("Longitude", 0))
        
        # Prevent completely invalid coords (AISStream sometimes sends 91/181 for unavail)
        if abs(lat) > 90 or abs(lon) > 180:
            return

        sog = float(msg.get("Sog", 0) or 0)
        cog = float(msg.get("Cog", 0) or 0)
        heading = msg.get("TrueHeading")
        heading_val = float(heading) if heading is not None and int(heading) != 511 else None

        time_str = meta.get("time_utc", "")
        obs_time = datetime.now(timezone.utc)
        if time_str:
            try:
                clean_str = time_str.split(" +0000")[0].replace("Z", "").strip()
                if "." in clean_str:
                    base, frac = clean_str.split(".")
                    clean_str = f"{base}.{frac[:6]}"
                obs_time = datetime.fromisoformat(clean_str).replace(tzinfo=timezone.utc)
            except Exception:
                pass

        with self._lock:
            v = self._get_or_create_vessel(mmsi)
            v["latitude"] = lat
            v["longitude"] = lon
            v["sog"] = sog
            v["cog"] = cog
            v["heading"] = heading_val
            v["timestamp"] = obs_time.isoformat()
            v["last_update"] = datetime.now(timezone.utc)
            
            v["track"].append({
                "lat": lat,
                "lon": lon,
                "sog": sog,
                "cog": cog,
                "timestamp": obs_time.isoformat()
            })
            
            if len(v["track"]) > MAX_TRACK_POINTS:
                v["track"] = v["track"][-MAX_TRACK_POINTS:]

            self._last_valid_update = obs_time

    def _handle_static_data(self, data: dict):
        meta = data.get("MetaData", {})
        msg = data.get("Message", {}).get("ShipStaticData", {})
        mmsi = str(meta.get("MMSI", ""))
        if not mmsi:
            return

        name = msg.get("Name", "").strip()
        imo = str(msg.get("ImoNumber", "")) or None
        vessel_type_code = msg.get("Type", 0)
        destination = msg.get("Destination", "").strip()

        with self._lock:
            v = self._get_or_create_vessel(mmsi)
            if name:
                v["name"] = name.replace('@', '').strip()
            v["imo"] = imo
            if destination:
                v["destination"] = destination.replace('@', '').strip()

            # Tanker Classification (80-89)
            if isinstance(vessel_type_code, dict):
                vessel_type_int = 0
            else:
                try:
                    vessel_type_int = int(vessel_type_code)
                except:
                    vessel_type_int = 0

            v["ais_type_code"] = vessel_type_int

            if 80 <= vessel_type_int <= 89:
                v["is_tanker"] = True
                if vessel_type_int == 80:
                    v["classification"] = "OIL TANKER"
                else:
                    v["classification"] = "TANKER — CARGO TYPE NOT AVAILABLE"
            elif 70 <= vessel_type_int <= 79:
                v["classification"] = "CARGO"
                v["is_tanker"] = False
            else:
                v["classification"] = f"TYPE {vessel_type_int}"
                v["is_tanker"] = False

            v["last_update"] = datetime.now(timezone.utc)
