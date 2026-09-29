from pydantic import BaseModel, Field
from typing import List, Optional, Any
from datetime import datetime

class Provenance(BaseModel):
    source: str
    timestamp: datetime
    location: Optional[str] = None
    data_type: str
    confidence: float

class SpillEventBase(BaseModel):
    latitude: float
    longitude: float
    detected_at: datetime
    area_km2: Optional[float] = None
    confidence: Optional[float] = None
    severity: Optional[str] = None
    source: Optional[str] = None
    data_mode: Optional[str] = None
    satellite_candidate_id: Optional[str] = None

class SpillEventCreate(SpillEventBase):
    id: str

class SpillEvent(SpillEventBase):
    id: str
    provenance: Optional[Provenance] = None

    class Config:
        orm_mode = True

class VesselPositionBase(BaseModel):
    vessel_id: str
    timestamp: datetime
    latitude: float
    longitude: float
    speed: Optional[float] = None          # Speed Over Ground (knots)
    course: Optional[float] = None         # Course Over Ground (degrees) — used for trajectory
    heading: Optional[float] = None        # Vessel heading (degrees) — separate from COG
    nav_status: Optional[str] = None       # Navigation status string
    mmsi: Optional[str] = None
    imo: Optional[str] = None
    source: Optional[str] = None
    source_record_id: Optional[str] = None
    data_mode: Optional[str] = None        # DEMO_REPLAY | HISTORICAL | LIVE | LIVE_STALE
    confidence: Optional[float] = None
    retrieved_at: Optional[datetime] = None
    is_interpolated: bool = False
    provenance: Optional[str] = None

class VesselPositionCreate(VesselPositionBase):
    id: str

class VesselPosition(VesselPositionBase):
    id: str

    class Config:
        from_attributes = True

class VesselBase(BaseModel):
    mmsi: Optional[str] = None
    imo: Optional[str] = None
    name: str
    vessel_type: str
    flag: Optional[str] = None
    length: Optional[float] = None

class VesselCreate(VesselBase):
    id: str

class Vessel(VesselBase):
    id: str
    positions: List[VesselPosition] = []
    
    class Config:
        from_attributes = True



class EnvironmentalObservationBase(BaseModel):
    observation_time: datetime
    retrieved_at: datetime
    source_record_id: Optional[str] = None
    latitude: float
    longitude: float
    # Optional: these can be None if a provider fails.
    # CRITICAL: None means "data unavailable". Do NOT substitute 0 — that would be scientifically misleading.
    wind_speed: Optional[float] = None       # knots
    wind_direction: Optional[float] = None   # degrees (coming from, standard met convention)
    current_speed: Optional[float] = None    # m/s
    current_direction: Optional[float] = None # degrees (going to, standard ocean convention)
    source: str
    confidence: float
    data_mode: str  # DEMO_REPLAY | HISTORICAL | LIVE | LIVE_PARTIAL | DEGRADED
    completeness: Optional[str] = "FULL"
    status: Optional[str] = "OK"
    available_components: List[str] = []
    missing_components: List[str] = []
    
class EnvironmentalObservation(EnvironmentalObservationBase):
    pass

class AttributionResultBase(BaseModel):
    spill_event_id: str
    vessel_id: str
    spatial_score: float
    temporal_score: float
    trajectory_score: float
    drift_score: float
    context_score: float
    overall_score: float
    confidence: str
    explanation: Any

class AttributionResultCreate(AttributionResultBase):
    id: str

class AttributionResult(AttributionResultBase):
    id: str
    created_at: datetime
    vessel: Optional[Vessel] = None
    
    class Config:
        orm_mode = True

class EvidenceNode(BaseModel):
    id: str
    type: str # satellite, spill, environment, drift, corridor, vessel, ais, attribution
    title: str
    source: Optional[str] = None
    timestamp: Optional[datetime] = None
    location: Optional[Any] = None
    confidence: Optional[float] = None
    data: Optional[Any] = None
    
class EvidenceEdge(BaseModel):
    source_id: str
    target_id: str
    label: str # detected, derived from, trajectory intersects, supported by, contributes to

class TimelineEvent(BaseModel):
    id: str
    timestamp: datetime
    type: str # SATELLITE, AIS, ENVIRONMENT, DRIFT, INCIDENT, ANALYSIS
    title: str
    description: str
    related_node_id: Optional[str] = None
    is_interpolated: Optional[bool] = False

class InvestigationSummary(BaseModel):
    incident_id: str
    detection_confidence: float
    best_drift_hypothesis: float
    model_confidence: float
    top_candidate_id: str
    top_candidate_score: float
    evidence_strength: str # STRONG, MODERATE, WEAK, CONTRADICTORY
    data_quality: float # 0 to 1
    nodes: List[EvidenceNode]
    edges: List[EvidenceEdge]
    timeline: List[TimelineEvent]

class SpillCandidate(BaseModel):
    id: str
    centroid_lat: float
    centroid_lon: float
    area_km2: float
    confidence_score: float    # 0.0 to 1.0 heuristic score
    confidence_breakdown: dict # { "anomaly": 0.8, "shape": 0.7, "context": 0.9, "penalty": 0.0 }
    backscatter_db: float      # mean backscatter of the dark region
    polygon: dict              # GeoJSON geometry
    observation_time: datetime
    product_id: str
    polarization: str          # "VV"
    look_alike_risk: str       # LOW | MEDIUM | HIGH
    processing_notes: List[str]     # Documented assumptions for explainability

