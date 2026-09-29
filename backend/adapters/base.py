from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from datetime import datetime
from models.database_models import (
    SpillEvent, Vessel, AISPosition, EnvironmentalObservation, SatelliteObservation
)
# Note: In a real system, we'd return Pydantic models from adapters, and the core 
# service would map them to SQLAlchemy models. For this MVP, returning SQLAlchemy 
# models directly (or Pydantic models mapped later) is fine. 
# We'll stick to returning Pydantic schemas to keep the engine decoupled from DB state, 
# as requested by the user: "All adapters must return normalized MarineGuard domain models."
from schemas.pydantic_schemas import (
    SpillEvent as PydanticSpillEvent,
    Vessel as PydanticVessel,
    VesselPosition as PydanticVesselPosition,
    EnvironmentalObservation as PydanticEnvObs
)

class BaseAdapter(ABC):
    @property
    @abstractmethod
    def health_status(self) -> str:
        """Return CONNECTED, DEGRADED, UNAVAILABLE, SIMULATED"""
        pass

class BaseSpillAdapter(BaseAdapter):
    @abstractmethod
    def fetch_recent_spills(self, bbox: List[float], time_range: tuple) -> List[PydanticSpillEvent]:
        pass
        
    @abstractmethod
    def fetch_satellite_observations(self, spill_id: str) -> List[Any]:
        # Would return SatelliteObservation schema
        pass

class BaseAISAdapter(BaseAdapter):
    @abstractmethod
    def fetch_positions(self, bbox: List[float], time_range: tuple) -> List[PydanticVesselPosition]:
        """Historical fetch"""
        pass
        
    @abstractmethod
    def stream_positions(self, bbox: List[float]):
        """Live stream subscription"""
        pass
        
    @abstractmethod
    def fetch_vessels(self, vessel_ids: List[str]) -> List[PydanticVessel]:
        pass

class BaseEnvironmentAdapter(BaseAdapter):
    @abstractmethod
    def fetch_environment(self, lat: float, lon: float, timestamp: datetime) -> PydanticEnvObs:
        pass
        
    @abstractmethod
    def fetch_live_environment(self, lat: float, lon: float) -> PydanticEnvObs:
        pass
