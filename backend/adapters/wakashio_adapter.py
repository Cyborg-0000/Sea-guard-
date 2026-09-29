import json
import os
from typing import List, Dict, Any

class WakashioAdapter:
    """
    Adapter to load Wakashio historical offline fixtures for Phase 9.2 SIH Demo.
    """
    def __init__(self):
        self.base_dir = os.path.join(os.path.dirname(__file__), "..", "..", "data", "historical", "wakashio")
        self._health_status = "OK"

    @property
    def health_status(self) -> str:
        if not os.path.exists(self.base_dir):
            return "UNAVAILABLE"
        return self._health_status

    def fetch_incident(self) -> Dict[str, Any]:
        with open(os.path.join(self.base_dir, "incident.json"), "r") as f:
            return json.load(f)

    def fetch_timeline(self) -> List[Dict[str, Any]]:
        with open(os.path.join(self.base_dir, "timeline.json"), "r") as f:
            return json.load(f)

    def fetch_satellite_metadata(self, scene_id: str) -> Dict[str, Any]:
        path = os.path.join(self.base_dir, "satellite", f"{scene_id}.json")
        if not os.path.exists(path):
            return {}
        with open(path, "r") as f:
            return json.load(f)
            
    def get_satellite_tiff_path(self, scene_id: str) -> str:
        return os.path.join(self.base_dir, "satellite", f"{scene_id}.tif")

    def fetch_vessels(self) -> List[Any]:
        # Wakashio historical playback doesn't render individual vessels, only the spill and map context
        return []
