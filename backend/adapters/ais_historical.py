"""
HistoricalAISAdapter — Historical AIS from CSV/Archive

Loads AIS positions from a local CSV file configured via HISTORICAL_AIS_PATH.

IMPORTANT: If the historical dataset is not configured or missing, this adapter
returns UNAVAILABLE status. It does NOT fall back to demo data — that would be
scientifically misleading in a forensic intelligence system.

If simulated fallback is needed during development, use DATA_MODE=DEMO_REPLAY
explicitly, which activates DemoAISAdapter.

CSV format expected:
  mmsi,imo,name,vessel_type,flag,latitude,longitude,sog,cog,heading,nav_status,timestamp

Example:
  338234597,,CRIMSON TANKER,Tanker,,18.421,66.213,8.2,180.0,182.0,0,2026-08-26T18:00:00Z
"""
import csv
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from adapters.base import BaseAISAdapter
from schemas.pydantic_schemas import Vessel as PydanticVessel, VesselPosition as PydanticVesselPosition
from services.ais_validator import AISValidator


class HistoricalAISAdapter(BaseAISAdapter):
    """
    Loads historical AIS data from a local CSV archive.

    DATA_MODE: HISTORICAL
    Configuration: HISTORICAL_AIS_PATH environment variable

    If HISTORICAL_AIS_PATH is not set or file is not found:
      → health_status = "UNAVAILABLE"
      → fetch_positions returns []
      → NO automatic fallback to demo vessels
    """

    def __init__(self):
        self._validator = AISValidator()
        self._csv_path = os.environ.get("HISTORICAL_AIS_PATH", os.path.join(os.path.dirname(__file__), "..", "..", "data", "historical", "wakashio", "ais", "wakashio.csv"))
        self._health_status = "UNAVAILABLE"
        self._positions: List[PydanticVesselPosition] = []
        self._vessels: dict = {}
        self._load_error: Optional[str] = None

        if self._csv_path:
            self._load_csv()
        else:
            print("[HistoricalAIS] HISTORICAL_AIS_PATH not set. Adapter is UNAVAILABLE.")
            self._load_error = "HISTORICAL_AIS_PATH environment variable not configured."

    @property
    def health_status(self) -> str:
        return self._health_status

    @property
    def load_error(self) -> Optional[str]:
        return self._load_error

    def fetch_positions(self, bbox: List[float], time_range: Tuple) -> List[PydanticVesselPosition]:
        """
        Returns historical positions filtered by time_range.
        Returns [] if data is unavailable — does NOT fall back to demo.
        """
        if self._health_status == "UNAVAILABLE":
            return []

        positions = self._positions
        start, end = time_range if time_range else (None, None)
        if start or end:
            positions = [
                p for p in positions
                if (start is None or p.timestamp >= start)
                and (end is None or p.timestamp <= end)
            ]

        valid, warnings = self._validator.validate_positions_batch(positions, reject_impossible=True)
        if warnings:
            print(f"[HistoricalAIS] Validation warnings: {len(warnings)}")
        return valid

    def fetch_vessels(self, vessel_ids: List[str]) -> List[PydanticVessel]:
        """Returns vessel metadata derived from loaded CSV data."""
        if self._health_status == "UNAVAILABLE":
            return []

        vessels = []
        for mmsi, meta in self._vessels.items():
            if not vessel_ids or meta.get("id") in vessel_ids:
                vessels.append(PydanticVessel(
                    id=meta.get("id", mmsi),
                    name=meta.get("name", f"MMSI:{mmsi}"),
                    vessel_type=meta.get("vessel_type", "Unknown"),
                    mmsi=mmsi,
                    imo=meta.get("imo") or None,
                    flag=meta.get("flag") or None,
                ))
        return vessels

    def stream_positions(self, bbox: List[float]):
        """Historical adapter does not support streaming."""
        pass

    # ------------------------------------------------------------------
    # Internal: CSV loading
    # ------------------------------------------------------------------

    def _load_csv(self):
        """Loads and validates positions from the configured CSV file."""
        if not os.path.exists(self._csv_path):
            self._health_status = "UNAVAILABLE"
            self._load_error = f"Historical AIS file not found: {self._csv_path}"
            print(f"[HistoricalAIS] {self._load_error}")
            return

        positions = []
        vessels: dict = {}
        retrieved_at = datetime.now(timezone.utc)

        try:
            with open(self._csv_path, newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row_num, row in enumerate(reader, start=2):
                    try:
                        mmsi = row.get("mmsi", "").strip()
                        lat = float(row["latitude"])
                        lon = float(row["longitude"])
                        ts_str = row["timestamp"].strip()

                        # Normalize timestamp to UTC-aware
                        ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                        if ts.tzinfo is None:
                            raise ValueError(f"Naive timestamp in row {row_num}: {ts_str}")

                        vessel_id = f"hist-{mmsi}" if mmsi else f"hist-{uuid.uuid4().hex[:8]}"

                        pos = PydanticVesselPosition(
                            id=f"hist-{uuid.uuid4().hex[:8]}",
                            vessel_id=vessel_id,
                            timestamp=ts,
                            latitude=lat,
                            longitude=lon,
                            speed=self._parse_float(row.get("sog")),
                            course=self._parse_float(row.get("cog")),   # COG for trajectory
                            heading=self._parse_float(row.get("heading")),
                            nav_status=row.get("nav_status", "").strip() or None,
                            mmsi=mmsi or None,
                            imo=row.get("imo", "").strip() or None,
                            source="HISTORICAL_CSV",
                            source_record_id=f"csv:{self._csv_path}:row{row_num}",
                            data_mode="HISTORICAL",
                            confidence=0.9,
                            retrieved_at=retrieved_at,
                            provenance=row.get("provenance", "REAL_HISTORICAL")
                        )
                        positions.append(pos)

                        if mmsi and mmsi not in vessels:
                            vessels[mmsi] = {
                                "id": vessel_id,
                                "mmsi": mmsi,
                                "name": row.get("name", "").strip() or f"MMSI:{mmsi}",
                                "vessel_type": row.get("vessel_type", "Unknown").strip(),
                                "imo": row.get("imo", "").strip() or None,
                                "flag": row.get("flag", "").strip() or None,
                            }

                    except (ValueError, KeyError) as e:
                        print(f"[HistoricalAIS] Skipping row {row_num}: {e}")
                        continue

            self._positions = positions
            self._vessels = vessels
            self._health_status = "CONNECTED" if positions else "UNAVAILABLE"
            print(f"[HistoricalAIS] Loaded {len(positions)} positions for {len(vessels)} vessels from {self._csv_path}")

        except Exception as e:
            self._health_status = "UNAVAILABLE"
            self._load_error = f"Failed to load CSV: {e}"
            print(f"[HistoricalAIS] {self._load_error}")

    @staticmethod
    def _parse_float(value) -> Optional[float]:
        """Parses a float field from CSV, returning None if missing or invalid."""
        if value is None or str(value).strip() == "":
            return None
        try:
            return float(value)
        except ValueError:
            return None
