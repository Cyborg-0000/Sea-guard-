import json
import os
from datetime import datetime, timezone
from typing import List, Tuple, Any
from adapters.base import BaseSpillAdapter, BaseAISAdapter, BaseEnvironmentAdapter
from schemas.pydantic_schemas import (
    SpillEvent as PydanticSpillEvent,
    Vessel as PydanticVessel,
    VesselPosition as PydanticVesselPosition,
    EnvironmentalObservation as PydanticEnvObs
)

class DemoSpillAdapter(BaseSpillAdapter):
    @property
    def health_status(self) -> str:
        return "SIMULATED"
        
    def fetch_recent_spills(self, bbox: List[float], time_range: tuple) -> List[PydanticSpillEvent]:
        # Path relative to backend root
        data_path = os.path.join(os.path.dirname(__file__), '../../data/demo/spills.json')
        with open(data_path, 'r') as f:
            spills_data = json.load(f)
            
        spills = []
        for s in spills_data:
            dt = datetime.fromisoformat(s['detected_at'].replace('Z', '+00:00'))
            spill = PydanticSpillEvent(
                id=s['id'],
                latitude=s['latitude'],
                longitude=s['longitude'],
                detected_at=dt,
                confidence=s.get('confidence', 0.91),
                area_km2=s.get('area_km2', 12.4),
                severity=s.get('severity', 'HIGH'),
                source='Sentinel-1 SAR (Demo)',
                data_mode='DEMO_REPLAY'
            )
            spills.append(spill)
        return spills

    def fetch_satellite_observations(self, spill_id: str) -> List[Any]:
        return []

class DemoAISAdapter(BaseAISAdapter):
    @property
    def health_status(self) -> str:
        return "SIMULATED"
        
    def fetch_vessels(self, vessel_ids: List[str]) -> List[PydanticVessel]:
        data_path = os.path.join(os.path.dirname(__file__), '../../data/demo/vessels.json')
        with open(data_path, 'r') as f:
            vessels_data = json.load(f)
            
        vessels = []
        for v in vessels_data:
            # We fetch all vessels for demo
            vessel = PydanticVessel(
                id=v['id'],
                name=v['name'],
                vessel_type=v['vessel_type']
            )
            vessels.append(vessel)
        return vessels

    def fetch_positions(self, bbox: List[float], time_range: tuple) -> List[PydanticVesselPosition]:
        data_path = os.path.join(os.path.dirname(__file__), '../../data/demo/vessel_positions.json')
        with open(data_path, 'r') as f:
            positions_data = json.load(f)
            
        positions = []
        for p in positions_data:
            dt = datetime.fromisoformat(p['timestamp'].replace('Z', '+00:00'))
            pos = PydanticVesselPosition(
                id=p['id'],
                vessel_id=p['vessel_id'],
                latitude=p['latitude'],
                longitude=p['longitude'],
                timestamp=dt,
                heading=p.get('heading'),
                speed=p.get('speed'),
                course=p.get('course', p.get('heading')),  # COG; fall back to heading if not present
                source="Demo AIS",
                data_mode="DEMO_REPLAY",
                confidence=1.0,
                retrieved_at=datetime.now(timezone.utc)
            )
            positions.append(pos)
        return positions

    def stream_positions(self, bbox: List[float]):
        pass

class DemoEnvironmentAdapter(BaseEnvironmentAdapter):
    @property
    def health_status(self) -> str:
        return "SIMULATED"
        
    def fetch_environment(self, lat: float, lon: float, timestamp: datetime) -> PydanticEnvObs:
        # Default demo environment matching previous hardcoded values — must not be changed
        return PydanticEnvObs(
            observation_time=timestamp,
            retrieved_at=datetime.now(timezone.utc),
            latitude=lat,
            longitude=lon,
            wind_speed=15.0,
            wind_direction=45.0,
            current_speed=0.5,
            current_direction=180.0,
            source="Demo Environment Model",
            confidence=0.75,
            data_mode="DEMO_REPLAY",
            status="CONNECTED",
            completeness="COMPLETE",
            available_components=["wind", "ocean_current"],
            missing_components=[]
        )
        
    def fetch_live_environment(self, lat: float, lon: float) -> PydanticEnvObs:
        return self.fetch_environment(lat, lon, datetime.now(timezone.utc))
