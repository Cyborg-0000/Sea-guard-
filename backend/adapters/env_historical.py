import csv
import os
from datetime import datetime, timezone
from typing import Optional, List, Dict
from adapters.base import BaseEnvironmentAdapter
from schemas.pydantic_schemas import EnvironmentalObservation

class HistoricalEnvironmentAdapter(BaseEnvironmentAdapter):
    """
    Loads historical environment data from local CSV for Wakashio.
    """
    def __init__(self):
        self._csv_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "historical", "wakashio", "environment", "observations.csv")
        self._health_status = "UNAVAILABLE"
        self._observations = []
        if os.path.exists(self._csv_path):
            self._load_csv()

    def _load_csv(self):
        try:
            with open(self._csv_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    self._observations.append({
                        "latitude": float(row["latitude"]),
                        "longitude": float(row["longitude"]),
                        "timestamp": datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00")),
                        "wind_speed": float(row["wind_speed"]),
                        "wind_direction": float(row["wind_direction"]),
                        "current_speed": float(row["current_speed"]),
                        "current_direction": float(row["current_direction"]),
                        "provenance": row["provenance"]
                    })
            self._health_status = "OK"
        except Exception as e:
            print(f"[HistoricalEnvironment] Failed to load {self._csv_path}: {e}")

    @property
    def health_status(self) -> str:
        return self._health_status

    def fetch_environment(self, lat: float, lon: float, timestamp: datetime) -> EnvironmentalObservation:
        if self._health_status != "OK" or not self._observations:
            raise Exception("Historical Environment Data Unavailable")

        # Find closest observation in time
        closest = min(self._observations, key=lambda x: abs((x["timestamp"] - timestamp).total_seconds()))
        
        now = datetime.now(timezone.utc)
        # We must not shift the historical time to pretend it matches perfectly
        # We report exactly what time we matched against
        return EnvironmentalObservation(
            wind_speed=closest["wind_speed"],
            wind_direction=closest["wind_direction"],
            current_speed=closest["current_speed"],
            current_direction=closest["current_direction"],
            source="Historical ERA5/CMEMS Archive",
            data_mode="HISTORICAL",
            observation_time=closest["timestamp"],
            retrieved_at=now,
            latitude=closest.get("latitude", lat),
            longitude=closest.get("longitude", lon),
            confidence=0.9,
            provenance=closest["provenance"]
        )

    def fetch_live_environment(self, lat: float, lon: float) -> EnvironmentalObservation:
        raise NotImplementedError("Historical Environment Adapter does not support live fetching.")
