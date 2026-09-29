from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Integer, JSON
from sqlalchemy.orm import declarative_base, relationship
import uuid
from datetime import datetime

Base = declarative_base()

def generate_uuid():
    return str(uuid.uuid4())

class Incident(Base):
    __tablename__ = 'incidents'
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String) # OPEN, CLOSED
    
    spill_events = relationship("SpillEvent", back_populates="incident")
    satellite_observations = relationship("SatelliteObservation", back_populates="incident")
    vessels = relationship("IncidentVessel", back_populates="incident")
    environmental_observations = relationship("EnvironmentalObservation", back_populates="incident")
    attribution_results = relationship("AttributionResult", back_populates="incident")

class SatelliteObservation(Base):
    __tablename__ = 'satellite_observations'
    id = Column(String, primary_key=True, default=generate_uuid)
    incident_id = Column(String, ForeignKey('incidents.id'))
    product_id = Column(String)
    acquisition_time = Column(DateTime)
    platform = Column(String)
    bounding_box = Column(JSON) # e.g. [min_lon, min_lat, max_lon, max_lat]
    raster_reference = Column(String)
    processing_level = Column(String)
    source = Column(String)
    retrieved_at = Column(DateTime, default=datetime.utcnow)
    
    incident = relationship("Incident", back_populates="satellite_observations")
    spill_events = relationship("SpillEvent", back_populates="satellite_observation")

class SpillEvent(Base):
    __tablename__ = 'spill_events'
    id = Column(String, primary_key=True, default=generate_uuid)
    incident_id = Column(String, ForeignKey('incidents.id'))
    satellite_observation_id = Column(String, ForeignKey('satellite_observations.id'), nullable=True)
    latitude = Column(Float)
    longitude = Column(Float)
    detected_at = Column(DateTime)
    confidence = Column(Float)
    area_km2 = Column(Float)
    severity = Column(String)
    source = Column(String)
    retrieved_at = Column(DateTime, default=datetime.utcnow)
    data_mode = Column(String) # DEMO, HISTORICAL, LIVE
    
    incident = relationship("Incident", back_populates="spill_events")
    satellite_observation = relationship("SatelliteObservation", back_populates="spill_events")

# Association table between Incidents and Vessels
class IncidentVessel(Base):
    __tablename__ = 'incident_vessels'
    incident_id = Column(String, ForeignKey('incidents.id'), primary_key=True)
    vessel_id = Column(String, ForeignKey('vessels.id'), primary_key=True)
    
    incident = relationship("Incident", back_populates="vessels")
    vessel = relationship("Vessel", back_populates="incidents")

class Vessel(Base):
    __tablename__ = 'vessels'
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String)
    vessel_type = Column(String)
    flag = Column(String, nullable=True)
    length = Column(Float, nullable=True)
    
    incidents = relationship("IncidentVessel", back_populates="vessel")
    positions = relationship("AISPosition", back_populates="vessel")

class AISPosition(Base):
    __tablename__ = 'ais_positions'
    id = Column(String, primary_key=True, default=generate_uuid)
    vessel_id = Column(String, ForeignKey('vessels.id'))
    incident_id = Column(String, ForeignKey('incidents.id'), nullable=True)
    timestamp = Column(DateTime)
    latitude = Column(Float)
    longitude = Column(Float)
    speed = Column(Float, nullable=True)
    course = Column(Float, nullable=True)
    heading = Column(Float, nullable=True)
    source = Column(String)
    source_record_id = Column(String, nullable=True)
    retrieved_at = Column(DateTime, default=datetime.utcnow)
    data_mode = Column(String)
    
    vessel = relationship("Vessel", back_populates="positions")

class EnvironmentalObservation(Base):
    __tablename__ = 'environmental_observations'
    id = Column(String, primary_key=True, default=generate_uuid)
    incident_id = Column(String, ForeignKey('incidents.id'))
    timestamp = Column(DateTime)
    latitude = Column(Float)
    longitude = Column(Float)
    wind_speed = Column(Float) # normalized
    wind_direction = Column(Float) # normalized
    current_speed = Column(Float) # normalized
    current_direction = Column(Float) # normalized
    source = Column(String)
    retrieved_at = Column(DateTime, default=datetime.utcnow)
    data_mode = Column(String)
    confidence = Column(Float)
    
    incident = relationship("Incident", back_populates="environmental_observations")

class AttributionResult(Base):
    __tablename__ = 'attribution_results'
    id = Column(String, primary_key=True, default=generate_uuid)
    incident_id = Column(String, ForeignKey('incidents.id'))
    spill_event_id = Column(String, ForeignKey('spill_events.id'))
    vessel_id = Column(String, ForeignKey('vessels.id'))
    spatial_score = Column(Float)
    temporal_score = Column(Float)
    trajectory_score = Column(Float)
    drift_score = Column(Float)
    context_score = Column(Float)
    overall_score = Column(Float)
    confidence = Column(String)
    explanation = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    incident = relationship("Incident", back_populates="attribution_results")
