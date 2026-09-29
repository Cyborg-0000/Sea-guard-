from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from typing import List, Dict, Any
import os
import asyncio
from pydantic import BaseModel


from schemas.pydantic_schemas import SpillEvent as SpillEventSchema, Vessel as VesselSchema, AttributionResult, InvestigationSummary
from services.correlation_engine import CorrelationEngine
from services.drift_model import DriftModel
from datetime import datetime, timezone, timedelta
from adapters.demo import DemoSpillAdapter, DemoAISAdapter, DemoEnvironmentAdapter

router = APIRouter()

from adapters.open_meteo import OpenMeteoAdapter
from adapters.ais_stream import AISStreamAdapter
from adapters.ais_historical import HistoricalAISAdapter
from adapters.satellite import SentinelAdapter, DemoSatelliteAdapter
from services.sar_processor import SARProcessor

# Initialize all adapters to allow dynamic switching from the UI
satellite_adapter_live = SentinelAdapter(SARProcessor())
satellite_adapter_demo = DemoSatelliteAdapter()

spill_adapter = DemoSpillAdapter()

ais_adapter_live = AISStreamAdapter()
ais_adapter_hist = HistoricalAISAdapter()
ais_adapter_demo = DemoAISAdapter()

env_adapter_live = OpenMeteoAdapter()
env_adapter_demo = DemoEnvironmentAdapter()

from adapters.wakashio_adapter import WakashioAdapter
from adapters.env_historical import HistoricalEnvironmentAdapter
wakashio_adapter = WakashioAdapter()
env_adapter_hist = HistoricalEnvironmentAdapter()

def get_demo_spill(spill_id: str) -> SpillEventSchema:
    spills = spill_adapter.fetch_recent_spills([], (None, None))
    for s in spills:
        if s.id == spill_id:
            return s
    raise HTTPException(status_code=404, detail="Spill not found")

def get_demo_vessels() -> List[VesselSchema]:
    return ais_adapter_demo.fetch_vessels([])

@router.get("/system/status")
def get_system_status():
    """
    Returns the health of all data providers for the Live mode.
    """
    ais_info: Dict[str, Any] = {
        "status": ais_adapter_live.health_status,
    }
    if hasattr(ais_adapter_live, "last_update") and ais_adapter_live.last_update:
        ais_info["last_update"] = ais_adapter_live.last_update.isoformat()
    if hasattr(ais_adapter_live, "registry"):
        ais_info["vessels_tracked"] = len(ais_adapter_live.registry)

    return {
        "providers": {
            "satellite": {"status": satellite_adapter_live.health_status},
            "ais": ais_info,
            "environment": {"status": env_adapter_live.health_status},
        }
    }


# Endpoints
@router.get("/spills", response_model=List[SpillEventSchema])
def get_spills():
    return spill_adapter.fetch_recent_spills([], (None, None))

@router.get("/spills/{spill_id}/satellite")
def get_satellite_candidate(spill_id: str):
    spill = get_demo_spill(spill_id)
    # Get environment to pass wind_speed
    try:
        env = env_adapter_demo.fetch_environment(spill.latitude, spill.longitude, spill.detected_at)
        wind_speed_kn = env.wind_speed
    except Exception:
        wind_speed_kn = None
        
    bbox = (spill.longitude - 0.5, spill.latitude - 0.5, spill.longitude + 0.5, spill.latitude + 0.5)
    candidates = satellite_adapter_demo.fetch_spill_candidates(bbox, wind_speed_kn)
    
    if not candidates:
        raise HTTPException(status_code=404, detail="No satellite candidate found for this spill")
        
    # In a real app we'd map the candidate ID to the spill, but here we just return the top one
    candidate = candidates[0]
    return candidate.dict()


# AIS vessel type codes for oil/chemical tankers and cargo ships (ITU AIS standard)
OIL_CARGO_TYPE_CODES = {
    "OIL TANKER", "CHEMICAL/OIL TANKER", "TANKER", "CRUDE OIL TANKER",
    "PRODUCT TANKER", "CHEMICAL TANKER", "GAS TANKER", "LNG TANKER",
    "LPG TANKER", "CARGO", "GENERAL CARGO", "BULK CARRIER",
}

def _is_oil_cargo_vessel(vessel_type: str) -> bool:
    """Returns True if the vessel type string matches oil/cargo categories."""
    if not vessel_type:
        return False
    upper = vessel_type.upper().strip()
    for category in OIL_CARGO_TYPE_CODES:
        if category in upper:
            return True
    # Also catch raw type codes like TYPE_80 (80-89 = tankers, 70-79 = cargo)
    if upper.startswith("TYPE_"):
        try:
            code = int(upper[5:])
            return 70 <= code <= 89
        except ValueError:
            pass
    return False

@router.get("/vessels")
def get_vessels(data_mode: str = "LIVE", tankers_only: bool = False):
    """Returns tracked vessels. tankers_only=true filters to oil/cargo vessels only."""
    if data_mode == "LIVE":
        vessels_out = []
        with ais_adapter_live._lock:
            for mmsi, v_data in ais_adapter_live.registry.items():
                if tankers_only and not v_data["is_tanker"]:
                    continue
                v_copy = {
                    "id": f"ais-{mmsi}",
                    "mmsi": mmsi,
                    "name": v_data["name"],
                    "vessel_type": v_data["classification"],
                    "imo": v_data["imo"],
                    "flag": "XX",
                    "positions": []
                }
                # To match Pydantic schema structure
                vessels_out.append(v_copy)
        return vessels_out
    elif data_mode == "HISTORICAL_INCIDENT":
        vessels = wakashio_adapter.fetch_vessels()
        if tankers_only:
            vessels = [v for v in vessels if _is_oil_cargo_vessel(v.vessel_type or "")]
        return [v.dict() for v in vessels]
    else:
        vessels = get_demo_vessels()
        positions = ais_adapter_demo.fetch_positions([], (None, None))
        pos_index_demo: dict = {}
        for p in positions:
            pos_index_demo.setdefault(p.vessel_id, []).append(p)
        for v in vessels:
            v.positions = pos_index_demo.get(v.id, [])
        if tankers_only:
            vessels = [v for v in vessels if _is_oil_cargo_vessel(v.vessel_type or "")]
        return [v.dict() for v in vessels]


@router.get("/vessels/oil-cargo/live")
def get_live_oil_cargo_vessels():
    """
    Dedicated endpoint: returns ONLY live oil/cargo tankers with latest position + track count.
    """
    result = []
    with ais_adapter_live._lock:
        for mmsi, v in ais_adapter_live.registry.items():
            if not v["is_tanker"]:
                continue
            
            latest = v["track"][-1] if v["track"] else None
            
            result.append({
                "id": f"ais-{mmsi}",
                "mmsi": mmsi,
                "name": v["name"],
                "vessel_type": v["classification"],
                "imo": v["imo"],
                "flag": "XX",
                "latest_position": {
                    "lat": latest["lat"],
                    "lon": latest["lon"],
                    "speed_kts": latest["sog"],
                    "course": latest["cog"],
                    "heading": v["heading"],
                    "timestamp": latest["timestamp"],
                } if latest else None,
                "track_points": len(v["track"]),
                "is_oil_cargo": True,
            })

    return {
        "vessels": result,
        "total": len(result),
        "source": "AISStream (live)",
        "ais_status": ais_adapter_live.health_status,
    }

@router.websocket("/ws/vessels/live")
async def websocket_live_vessels(websocket: WebSocket):
    await websocket.accept()
    print("[WebSocket] Client connected for live AIS.")
    try:
        while True:
            # Poll registry every 1 second
            result = []
            with ais_adapter_live._lock:
                for mmsi, v in ais_adapter_live.registry.items():
                    if not v["is_tanker"]:
                        continue
                    
                    latest = v["track"][-1] if v["track"] else None
                    if latest:
                        result.append({
                            "id": f"ais-{mmsi}",
                            "mmsi": mmsi,
                            "name": v["name"],
                            "vessel_type": v["classification"],
                            "imo": v["imo"],
                            "flag": "XX",
                            "latest_position": {
                                "lat": latest["lat"],
                                "lon": latest["lon"],
                                "speed_kts": latest["sog"],
                                "course": latest["cog"],
                                "heading": v["heading"],
                                "timestamp": latest["timestamp"],
                            },
                            "track_points": len(v["track"]),
                            "is_oil_cargo": True,
                            # Provide full track so frontend can render LineString
                            "track": v["track"]
                        })
            
            msg = {
                "vessels": result,
                "total": len(result),
                "ais_status": ais_adapter_live.health_status
            }
            await websocket.send_json(msg)
            await asyncio.sleep(2.0)
    except WebSocketDisconnect:
        print("[WebSocket] Client disconnected from live AIS.")
    except Exception as e:
        print(f"[WebSocket] Error: {e}")


@router.get("/ais/diagnostics")
def get_ais_diagnostics():
    """
    Runtime QA diagnostics for the AISStream pipeline.
    Returns stream health, registry counts, tanker breakdown, and sample data.
    """
    if not hasattr(ais_adapter_live, "get_diagnostic_stats"):
        return {"error": "Adapter does not support diagnostics"}
    return ais_adapter_live.get_diagnostic_stats()


@router.get("/vessels/{mmsi}/track")

def get_vessel_track(mmsi: str, data_mode: str = "LIVE"):
    """
    Returns position history (trail) for a specific vessel by MMSI.
    Inspired by GEV's /api/ais-live/track?mmsi=... endpoint.
    Use this to render a vessel trail on the map.
    """
    if not mmsi or not mmsi.isdigit():
        raise HTTPException(status_code=400, detail="Valid numeric MMSI required")
    vessel_id = f"ais-{mmsi}"
    if data_mode == "LIVE":
        with ais_adapter_live._lock:
            v_data = ais_adapter_live.registry.get(mmsi)
            if v_data:
                track = []
                for pt in v_data["track"]:
                    track.append({
                        "lat": pt["lat"],
                        "lon": pt["lon"],
                        "speed_kts": pt["sog"],
                        "course": pt["cog"],
                        "heading": v_data["heading"],
                        "timestamp": pt["timestamp"],
                    })
                vessel_meta = {
                    "id": vessel_id,
                    "mmsi": mmsi,
                    "name": v_data["name"],
                    "vessel_type": v_data["classification"],
                    "imo": v_data["imo"],
                    "flag": "XX"
                }
            else:
                track = []
                vessel_meta = None
    elif data_mode == "HISTORICAL_INCIDENT":
        positions = ais_adapter_hist.fetch_positions([], (None, None))
        track = sorted(
            [p for p in positions if p.mmsi == mmsi or p.vessel_id == vessel_id],
            key=lambda p: p.timestamp
        )
        vessel_meta = None
    else:
        positions = ais_adapter_demo.fetch_positions([], (None, None))
        track = sorted(
            [p for p in positions if p.vessel_id == vessel_id or p.mmsi == mmsi],
            key=lambda p: p.timestamp
        )
        vessel_meta = None

    return {
        "mmsi": mmsi,
        "vessel": vessel_meta.dict() if vessel_meta else None,
        "track": [
            {
                "lat": p.latitude,
                "lon": p.longitude,
                "speed_kts": p.speed,
                "course": p.course,
                "heading": p.heading,
                "timestamp": p.timestamp.isoformat() if p.timestamp else None,
            }
            for p in track
        ],
        "count": len(track),
        "source": "AISStream (live buffer)" if data_mode == "LIVE" else data_mode,
    }



@router.get("/spills/{spill_id}/environment")
def get_environment(spill_id: str, live: bool = False):

    spill = get_demo_spill(spill_id)
    try:
        if live and hasattr(env_adapter_demo, 'fetch_live_environment'):
            env = env_adapter_demo.fetch_live_environment(spill.latitude, spill.longitude)
        else:
            env = env_adapter_demo.fetch_environment(spill.latitude, spill.longitude, spill.detected_at)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Environment provider unavailable: {e}")
        
    drift_model = DriftModel()
    drift_vector = drift_model.calculate_drift_vector(env)
    
    return {
        "data_mode": env.data_mode,
        "provider": env.source,
        "observation_time": env.observation_time,
        "retrieval_time": env.retrieved_at,
        "wind": {
            "speed_knots": env.wind_speed,
            "direction": env.wind_direction
        },
        "current": {
            "speed_ms": env.current_speed,
            "direction": env.current_direction
        },
        "drift_vector": {
            "magnitude": drift_vector.magnitude(),
            "bearing": drift_vector.bearing()
        },
        "model_confidence": env.confidence,
        "provenance": {
            "source_record_id": env.source_record_id
        }
    }

@router.get("/spills/{spill_id}/source-corridor")
def get_source_corridor(spill_id: str, duration_hours: float = 5.0):
    spill = get_demo_spill(spill_id)
    drift = DriftModel()
    try:
        env = env_adapter_demo.fetch_environment(spill.latitude, spill.longitude, spill.detected_at)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Environment provider unavailable: {e}")
    corridor = drift.generate_source_corridor(spill.latitude, spill.longitude, env, duration_hours)
    return corridor

@router.get("/spills/{spill_id}/drift")
def get_drift(spill_id: str, duration_hours: float = 5.0):
    spill = get_demo_spill(spill_id)
    drift = DriftModel()
    try:
        env = env_adapter_demo.fetch_environment(spill.latitude, spill.longitude, spill.detected_at)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Environment provider unavailable: {e}")
    
    corridor_centerline = drift.simulate_drift(spill.latitude, spill.longitude, env, duration_hours, reverse=True)
    estimated_source = corridor_centerline[-1]
    
    forward_path = drift.simulate_drift(estimated_source[0], estimated_source[1], env, duration_hours, reverse=False)
    
    return {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": [[p[1], p[0]] for p in forward_path]
        }
    }

class AttributionRequest(BaseModel):
    duration_hours: float = 5.0

@router.post("/spills/{spill_id}/attribution")
def run_attribution(spill_id: str, req: AttributionRequest = AttributionRequest()):
    spill = get_demo_spill(spill_id)
    vessels = get_demo_vessels()
    
    # We need to map positions for CorrelationEngine (which expects positions on vessels)
    positions = ais_adapter_demo.fetch_positions([], (None, None))
    for v in vessels:
        v.positions = [p for p in positions if p.vessel_id == v.id]
        
    engine = CorrelationEngine(drift_model=DriftModel())
    results = engine.run_attribution(spill, vessels, req.duration_hours) # type: ignore
    
    return {"results": results}

@router.get("/spills/{spill_id}/hypotheses")
def run_hypotheses(spill_id: str):
    spill = get_demo_spill(spill_id)
    vessels = get_demo_vessels()
    
    positions = ais_adapter_demo.fetch_positions([], (None, None))
    for v in vessels:
        v.positions = [p for p in positions if p.vessel_id == v.id]
        
    engine = CorrelationEngine(drift_model=DriftModel())
    durations = [1.0, 3.0, 5.0, 8.0, 12.0]
    
    hypotheses = []
    
    for d in durations:
        results = engine.run_attribution(spill, vessels, d) # type: ignore
        best = results[0]
        v_name = next(v.name for v in vessels if v.id == best.vessel_id)
        
        hypotheses.append({
            "duration_hours": d,
            "best_candidate": v_name,
            "best_candidate_id": best.vessel_id,
            "source_time_fit": best.explanation["source_time_fit"],
            "overall_score": best.overall_score
        })
        
    return {"hypotheses": hypotheses}

@router.get("/spills/{spill_id}/investigation", response_model=InvestigationSummary)
def get_investigation(spill_id: str, duration_hours: float = 5.0):
    spill = get_demo_spill(spill_id)
    vessels = get_demo_vessels()
    
    positions = ais_adapter_demo.fetch_positions([], (None, None))
    for v in vessels:
        v.positions = [p for p in positions if p.vessel_id == v.id]
        
    drift = DriftModel()
    try:
        env = env_adapter_demo.fetch_environment(spill.latitude, spill.longitude, spill.detected_at)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Environment provider unavailable: {e}")
        
    bbox = (spill.longitude - 0.5, spill.latitude - 0.5, spill.longitude + 0.5, spill.latitude + 0.5)
    sat_candidates = satellite_adapter_demo.fetch_spill_candidates(bbox, env.wind_speed if env else None)
    top_sat_candidate = sat_candidates[0] if sat_candidates else None
    
    engine = CorrelationEngine(drift_model=drift)
    candidates = engine.run_attribution(spill, vessels, duration_hours) # type: ignore
    
    from services.investigation_engine import build_investigation_graph
    summary = build_investigation_graph(spill, env, duration_hours, candidates, vessels, top_sat_candidate=top_sat_candidate)
    return summary

# --- Phase 9 Orchestration API (The Killer Demo) ---

class ScanRequest(BaseModel):
    bbox: List[float] = [4.0, 52.0, 5.0, 53.0]
    data_mode: str = "LIVE"
    
@router.post("/incidents/scan")
def scan_incident(req: ScanRequest):
    """
    Step 1: SCAN
    Queries Sentinel-1 (or mocks based on mode), processes SAR, and returns candidates.
    """
    if req.data_mode == "LIVE":
        try:
            import datetime as dt
            target_time = dt.datetime.now(dt.timezone.utc).isoformat()
            # Convert list to tuple for satellite adapter
            bbox_tuple = (req.bbox[0], req.bbox[1], req.bbox[2], req.bbox[3])
            feature = satellite_adapter_live._select_best_product(bbox_tuple, target_time)
            if not feature:
                raise HTTPException(status_code=404, detail="No Sentinel-1 product found.")
                
            product_id = feature.get("id") or "unknown"
            acq_time = feature.get("properties", {}).get("datetime")
            
            token = satellite_adapter_live._get_cdse_token()
            if not token:
                raise HTTPException(status_code=503, detail="Failed to authenticate with CDSE")
                
            tiff_path = satellite_adapter_live._process_scene(feature, bbox_tuple, token)
            if not tiff_path:
                raise HTTPException(status_code=500, detail="Failed to process GeoTIFF.")
                
            dt = datetime.fromisoformat(acq_time.replace('Z', '+00:00'))
            processor = SARProcessor()
            candidates = processor.detect_spill_candidates(tiff_path, 8.0, dt, product_id)
            if os.path.exists(tiff_path):
                os.unlink(tiff_path)
                
            import json
            return {
                "satellite_product": product_id,
                "acquisition_time": acq_time,
                "candidates": [json.loads(c.json()) for c in candidates[:5]],
                "provenance": "REAL"
            }
        except Exception as e:
            print(f"[LIVE SCAN ERROR] {e}. Falling back to mocked LIVE anomaly.")
            import datetime as dt
            acq_time = dt.datetime.now(dt.timezone.utc).isoformat()
            center_lon = (req.bbox[0] + req.bbox[2]) / 2.0
            center_lat = (req.bbox[1] + req.bbox[3]) / 2.0
            
            return {
                "satellite_product": "MOCK_S1A_LIVE",
                "acquisition_time": acq_time,
                "candidates": [{
                    "id": f"mock-live-{int(dt.datetime.now().timestamp())}",
                    "centroid_lat": center_lat,
                    "centroid_lon": center_lon,
                    "observation_time": acq_time,
                    "area_km2": 4.2,
                    "confidence_score": 0.91,
                    "look_alike_risk": "LOW",
                    "polygon": None,
                    "polarization": "VV"
                }],
                "provenance": "SIMULATED_LIVE_FALLBACK"
            }
            
    elif req.data_mode == "HISTORICAL_INCIDENT":
        # Wakashio Offline Fixture
        if wakashio_adapter.health_status == "UNAVAILABLE":
            raise HTTPException(status_code=503, detail="Historical offline fixtures unavailable")
        
        scene = wakashio_adapter.fetch_satellite_metadata("S1A_IW_GRDH_1SDV_20200807T061200_SIM")
        if not scene:
            raise HTTPException(status_code=404, detail="Historical satellite scene not found in cache")
        
        # Load the Wakashio incident facts from fixture for accurate coordinates
        try:
            incident = wakashio_adapter.fetch_incident()
            grounding_lat = float(incident.get("grounding_location", {}).get("latitude", -20.432))
            grounding_lon = float(incident.get("grounding_location", {}).get("longitude", 57.744))
        except Exception:
            grounding_lat, grounding_lon = -20.432, 57.744
        
        dt_acq = datetime.fromisoformat(scene["acquisition_time"].replace("Z", "+00:00"))
        scene_prov = scene.get("provenance", "SIMULATED_HISTORICAL")
        
        # For the HISTORICAL_INCIDENT demo, we directly construct the candidate from
        # the known Wakashio oil spill geometry instead of running the SAR processor
        # on the synthetic TIF (which has no signal above detection threshold).
        # PROVENANCE: SIMULATED_HISTORICAL (clearly labeled)
        candidate_dict = {
            "id": scene["id"],
            "centroid_lat": grounding_lat - 0.002,   # spill slightly SW of grounding point
            "centroid_lon": grounding_lon - 0.003,
            "observation_time": scene["acquisition_time"],
            "area_km2": 26.4,
            "confidence_score": 0.87,
            "look_alike_risk": "LOW",
            "polygon": None,
            "polarization": scene.get("polarization", "VV"),
            "product_id": scene["id"],
            "backscatter_db": -18.7,
            "confidence_breakdown": {
                "anomaly_strength": 0.68,
                "shape_compatibility": 0.42,
                "environmental_penalty": -0.08
            },
            "processing_notes": [
                "SIMULATED_HISTORICAL: Synthetic fixture for offline SIH demo.",
                "Real Sentinel-1 SAR data for this scene requires CDSE authentication.",
                "Oil slick geometry approximated from IOPC Fund incident reports."
            ],
            "provenance": scene_prov
        }
            
        return {
            "satellite_product": scene["id"],
            "acquisition_time": scene["acquisition_time"],
            "candidates": [candidate_dict],
            "provenance": scene_prov
        }

    elif req.data_mode == "HISTORICAL":
        from datetime import timezone, timedelta
        acq_time = datetime.now(timezone.utc) - timedelta(days=1)
        return {
            "satellite_product": "MOCK_S1C_HISTORICAL",
            "acquisition_time": acq_time.isoformat(),
            "candidates": [
                {
                    "id": "mock-candidate-1",
                    "centroid_lat": 52.3899,
                    "centroid_lon": 4.4447,
                    "observation_time": acq_time.isoformat(),
                    "area_km2": 2.5,
                    "confidence_score": 0.88,
                    "look_alike_risk": "LOW",
                    "polygon": None,
                    "polarization": "VV"
                }
            ],
            "provenance": "SIMULATED_HISTORICAL"
        }
    else:
        # DEMO_REPLAY
        spills = spill_adapter.fetch_recent_spills([], (None, None))
        top_spill = spills[0]
        return {
            "satellite_product": "DEMO_S1A_SCENE",
            "acquisition_time": top_spill.detected_at.isoformat(),
            "candidates": [
                {
                    "id": top_spill.id,
                    "centroid_lat": top_spill.latitude,
                    "centroid_lon": top_spill.longitude,
                    "observation_time": top_spill.detected_at.isoformat(),
                    "area_km2": top_spill.area_km2,
                    "confidence_score": top_spill.confidence,
                    "look_alike_risk": "LOW",
                    "polygon": None,
                    "polarization": "VV"
                }
            ],
            "provenance": "SIMULATED_HISTORICAL"
        }

class InvestigateRequest(BaseModel):
    candidate: dict
    drift_duration_hours: float = 5.0
    data_mode: str = "LIVE"

@router.post("/incidents/investigate")
def investigate_incident(req: InvestigateRequest):
    """
    Step 2: INVESTIGATE
    Fetches environment and computes drift corridor.
    """
    obs_time_str = req.candidate.get("observation_time")
    if not obs_time_str:
        raise HTTPException(status_code=400, detail="candidate.observation_time is required")
    lat = req.candidate.get("centroid_lat")
    lon = req.candidate.get("centroid_lon")
    if lat is None or lon is None:
        raise HTTPException(status_code=400, detail="candidate.centroid_lat and centroid_lon are required")
    lat = float(lat)
    lon = float(lon)
    obs_time = datetime.fromisoformat(obs_time_str.replace("Z", "+00:00"))
    
    if req.data_mode == "HISTORICAL_INCIDENT":
        env_adapter = env_adapter_hist
    elif req.data_mode in ("LIVE", "HISTORICAL"):
        env_adapter = env_adapter_live
    else:
        env_adapter = env_adapter_demo
        
    try:
        env = env_adapter.fetch_environment(lat, lon, obs_time)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Environment provider unavailable: {e}")
        
    drift_model = DriftModel()
    corridor = drift_model.simulate_drift(lat, lon, env, req.drift_duration_hours, reverse=True)
    estimated_source_lat, estimated_source_lon = corridor[-1]
    
    prov = "REAL" if req.data_mode in ("LIVE", "HISTORICAL") else "SIMULATED_HISTORICAL"
    if req.data_mode == "HISTORICAL_INCIDENT":
        prov = env.provenance if hasattr(env, 'provenance') else "SIMULATED_HISTORICAL"
        
    return {
        "environment": {
            "wind_speed": env.wind_speed,
            "wind_direction": env.wind_direction,
            "current_speed": env.current_speed,
            "current_direction": env.current_direction,
            "observation_time": env.observation_time.isoformat(),
            "provenance": prov
        },
        "drift": {
            "estimated_source": [estimated_source_lat, estimated_source_lon],
            "corridor": corridor,
            "uncertainty_km": 5.0,
            "duration_hours": req.drift_duration_hours,
            "provenance": "COMPUTED"
        }
    }

class CorrelateRequest(BaseModel):
    candidate: dict
    drift_duration_hours: float = 5.0
    data_mode: str = "LIVE"

@router.post("/incidents/correlate")
def correlate_incident(req: CorrelateRequest):
    """
    Step 3: CORRELATE (and VERDICT)
    Analyzes AIS temporal coverage and attributes if sufficient.
    """
    obs_time_str = req.candidate.get("observation_time")
    if not obs_time_str:
        raise HTTPException(status_code=400, detail="candidate.observation_time is required")
    lat = req.candidate.get("centroid_lat")
    lon = req.candidate.get("centroid_lon")
    if lat is None or lon is None:
        raise HTTPException(status_code=400, detail="candidate.centroid_lat and centroid_lon are required")
    lat = float(lat)
    lon = float(lon)
    obs_time = datetime.fromisoformat(obs_time_str.replace("Z", "+00:00"))
    
    # Create an internal SpillEvent for the CorrelationEngine
    spill = SpillEventSchema(
        id=f"MG-2026-{req.candidate.get('id', 'mock')[:8]}",
        latitude=lat,
        longitude=lon,
        detected_at=obs_time,
        area_km2=req.candidate.get("area_km2", 1.0),
        confidence=req.candidate.get("confidence_score", 0.9),
        severity="MEDIUM",
        source="Sentinel-1",
        data_mode=req.data_mode,
        satellite_candidate_id=req.candidate.get("id")
    )
    
    if req.data_mode == "LIVE":
        # The legacy fetch_vessels([]) stub returns an empty list.
        # Instead, build real Pydantic vessel objects directly from the live registry
        # so CorrelationEngine receives actual tanker records.
        from schemas.pydantic_schemas import VesselPosition as PydanticVesselPosition
        from datetime import timezone as _tz
        live_vessels_out: List[VesselSchema] = []
        live_positions_out: List[PydanticVesselPosition] = []
        with ais_adapter_live._lock:
            for mmsi, v_data in ais_adapter_live.registry.items():
                if not v_data.get("is_tanker"):
                    continue
                vessel_id = f"ais-{mmsi}"
                pv = VesselSchema(
                    id=vessel_id,
                    mmsi=mmsi,
                    name=v_data.get("name", "UNKNOWN"),
                    vessel_type=v_data.get("classification", "TANKER"),
                    imo=v_data.get("imo"),
                    flag="XX",
                    positions=[],
                )
                live_vessels_out.append(pv)
                for pt in v_data.get("track", []):
                    try:
                        ts = datetime.fromisoformat(pt["timestamp"].replace("Z", "+00:00"))
                    except Exception:
                        ts = datetime.now(timezone.utc)
                    pp = PydanticVesselPosition(
                        vessel_id=vessel_id,
                        mmsi=mmsi,
                        latitude=pt["lat"],
                        longitude=pt["lon"],
                        speed=pt.get("sog", 0.0),
                        course=pt.get("cog", 0.0),
                        heading=v_data.get("heading"),
                        timestamp=ts,
                        data_mode="LIVE",
                    )
                    live_positions_out.append(pp)
                pv.positions = [p for p in live_positions_out if p.vessel_id == vessel_id]

        # Run correlation engine against real tankers
        engine = CorrelationEngine(drift_model=DriftModel())
        results = engine.run_attribution(spill, live_vessels_out, req.drift_duration_hours)  # type: ignore

        # Proximity check: identify tankers near candidate (NOT automatic attribution)
        nearby = []
        import math
        for mmsi, v_data in ais_adapter_live.registry.items():
            if not v_data.get("is_tanker"):
                continue
            vtrack = v_data.get("track", [])
            if not vtrack:
                continue
            last_pt = vtrack[-1]
            dlat = last_pt["lat"] - lat
            dlon = last_pt["lon"] - lon
            dist_km = math.sqrt(dlat**2 + dlon**2) * 111.0
            if dist_km < 100:
                nearby.append({
                    "mmsi": mmsi,
                    "name": v_data.get("name", "UNKNOWN"),
                    "dist_km": round(dist_km, 1),
                    "lat": last_pt["lat"],
                    "lon": last_pt["lon"],
                    "sog": last_pt.get("sog"),
                })

        best_result = results[0] if results else None
        coverage_status = "FULL"
        if not live_vessels_out:
            coverage_status = "INSUFFICIENT"
        elif best_result and best_result.explanation.get("ais_coverage") == "INSUFFICIENT":
            coverage_status = "INSUFFICIENT"

        response: Dict[str, Any] = {
            "ais_summary": {
                "status": ais_adapter_live.health_status,
                "vessels": len(live_vessels_out),
                "observations": len(live_positions_out),
                "coverage_status": coverage_status,
                "provenance": "REAL_LIVE",
                "nearby_tankers": nearby,
            },
            "verdict": None,
        }

        if coverage_status == "INSUFFICIENT" or not best_result:
            response["verdict"] = {
                "status": "BLOCKED",
                "reason": "INSUFFICIENT TEMPORAL COVERAGE — live AIS track too short for causal attribution",
            }
        else:
            v_meta = next((v for v in live_vessels_out if v.id == best_result.vessel_id), None)
            if v_meta:
                response["verdict"] = {
                    "status": "CANDIDATE_IDENTIFIED",
                    "note": "Spatial/temporal proximity only — NOT confirmed attribution without extended AIS coverage",
                    "vessel": {"name": v_meta.name, "mmsi": v_meta.mmsi, "type": v_meta.vessel_type},
                    "score": best_result.overall_score,
                    "explanation": best_result.explanation,
                }
            else:
                response["verdict"] = {"status": "BLOCKED", "reason": "No matching vessel found"}

        # Build investigation graph
        import json as _json
        try:
            env_live = env_adapter_live.fetch_environment(lat, lon, obs_time)
        except Exception:
            env_live = None

        from services.investigation_engine import build_investigation_graph
        from schemas.pydantic_schemas import SpillCandidate
        c_dict2 = req.candidate.copy()
        c_dict2["confidence_breakdown"] = c_dict2.get("confidence_breakdown") or {}
        c_dict2["backscatter_db"] = c_dict2.get("backscatter_db") or 0.0
        c_dict2["polygon"] = c_dict2.get("polygon") or {"type": "Polygon", "coordinates": []}
        c_dict2["product_id"] = c_dict2.get("product_id") or "MOCK_PRODUCT"
        c_dict2["processing_notes"] = c_dict2.get("processing_notes") or []
        sat_candidate2 = SpillCandidate(**c_dict2)
        summary2 = build_investigation_graph(spill, env_live, req.drift_duration_hours, results, live_vessels_out, top_sat_candidate=sat_candidate2)
        response["investigation_summary"] = _json.loads(summary2.json())
        response["results"] = [_json.loads(r.json()) for r in results]
        return response

    elif req.data_mode == "HISTORICAL_INCIDENT":
        ais_adapter = HistoricalAISAdapter() # It will default to the Wakashio dataset
    elif req.data_mode == "HISTORICAL":
        # Generate a synthetic Crimson Tanker CSV aligned to this candidate's observation time.
        # The source was estimated drift_duration_hours before the acquisition.
        # PROVENANCE: SIMULATED_HISTORICAL (clearly labeled — not real AIS data)
        import csv as csv_mod
        import tempfile
        drift_hours = req.drift_duration_hours
        estimated_source_time = obs_time - timedelta(hours=drift_hours)
        
        # Use drift model to find estimated source position
        try:
            env_tmp = env_adapter_live.fetch_environment(lat, lon, obs_time)
            tmp_corridor = DriftModel().simulate_drift(lat, lon, env_tmp, drift_hours, reverse=True)
            src_lat, src_lon = tmp_corridor[-1]
        except Exception:
            src_lat, src_lon = lat - 0.2, lon - 0.15
        
        # Use NamedTemporaryFile instead of deprecated mktemp
        tmp_file = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, newline="")
        tmp_csv = tmp_file.name
        tmp_file.close()
        with open(tmp_csv, "w", newline="") as f:
            writer = csv_mod.writer(f)
            writer.writerow(["mmsi","imo","name","vessel_type","flag","latitude","longitude","sog","cog","heading","nav_status","timestamp"])
            # Crimson Tanker: passes through estimated source corridor
            for i in range(-2, 3):
                t = estimated_source_time + timedelta(hours=i)
                writer.writerow([
                    "338234597", "IMO9876543", "CRIMSON TANKER", "Tanker", "PA",
                    round(src_lat + (i * 0.04), 4), round(src_lon + (i * 0.03), 4),
                    10.5, 145.0, 145.0, "0", t.strftime("%Y-%m-%dT%H:%M:%S+00:00")
                ])
            # Decoy vessel: different trajectory, further away
            for i in range(-2, 3):
                t = estimated_source_time + timedelta(hours=i)
                writer.writerow([
                    "123456789", "", "NORTHERN STAR", "Cargo", "NL",
                    round(src_lat + 0.4 + (i * 0.08), 4), round(src_lon - 0.4 + (i * 0.08), 4),
                    14.0, 30.0, 30.0, "0", t.strftime("%Y-%m-%dT%H:%M:%S+00:00")
                ])
        
        os.environ["HISTORICAL_AIS_PATH"] = tmp_csv
        ais_adapter = HistoricalAISAdapter()
        # Clean up temp file after loading (data is now in memory)
        if os.path.exists(tmp_csv):
            os.unlink(tmp_csv)
    else:
        ais_adapter = ais_adapter_demo
        
    vessels = ais_adapter.fetch_vessels([])
    positions = ais_adapter.fetch_positions([], (None, None))
    for v in vessels:
        v.positions = [p for p in positions if p.vessel_id == v.id]
        
    engine = CorrelationEngine(drift_model=DriftModel())
    results = engine.run_attribution(spill, vessels, req.drift_duration_hours) # type: ignore
    
    # Evaluate Temporal Coverage
    best_result = results[0] if results else None
    coverage_status = "FULL"
    if best_result and best_result.explanation.get("ais_coverage") == "INSUFFICIENT":
        coverage_status = "INSUFFICIENT"
    elif not vessels:
        coverage_status = "INSUFFICIENT"
        
    response: Dict[str, Any] = {
        "ais_summary": {
            "status": ais_adapter.health_status,
            "vessels": len(vessels),
            "observations": len(positions),
            "coverage_status": coverage_status,
            "provenance": "REAL" if req.data_mode == "LIVE" else "SIMULATED_HISTORICAL"
        },
        "verdict": None
    }
    
    if coverage_status == "INSUFFICIENT" or not best_result:
        response["verdict"] = {
            "status": "BLOCKED",
            "reason": "INSUFFICIENT TEMPORAL COVERAGE"
        }
    else:
        v_meta = next(v for v in vessels if v.id == best_result.vessel_id)
        response["verdict"] = {
            "status": "ATTRIBUTED",
            "vessel": {
                "name": v_meta.name,
                "mmsi": v_meta.mmsi,
                "type": v_meta.vessel_type
            },
            "score": best_result.overall_score,
            "explanation": best_result.explanation
        }
        
    # Generate the investigation graph using the newly acquired data to fuel the Evidence Graph frontend
    import json
    try:
        if req.data_mode == "HISTORICAL_INCIDENT":
            env = env_adapter_hist.fetch_environment(lat, lon, obs_time)
        elif req.data_mode != "DEMO_REPLAY":
            env = env_adapter_live.fetch_environment(lat, lon, obs_time)
        else:
            env = env_adapter_demo.fetch_environment(lat, lon, obs_time)
    except Exception:
        env = None
        
    from services.investigation_engine import build_investigation_graph
    from schemas.pydantic_schemas import SpillCandidate
    
    # req.candidate is a dict from the frontend, but the graph engine expects the Pydantic object
    # For HISTORICAL and DEMO modes, the mocked candidate might be missing some fields, so we supply defaults.
    c_dict = req.candidate.copy()
    c_dict["confidence_breakdown"] = c_dict.get("confidence_breakdown") or {}
    c_dict["backscatter_db"] = c_dict.get("backscatter_db") or 0.0
    c_dict["polygon"] = c_dict.get("polygon") or {"type": "Polygon", "coordinates": []}
    c_dict["product_id"] = c_dict.get("product_id") or "MOCK_PRODUCT"
    c_dict["processing_notes"] = c_dict.get("processing_notes") or []
    
    sat_candidate = SpillCandidate(**c_dict)
    
    summary = build_investigation_graph(spill, env, req.drift_duration_hours, results, vessels, top_sat_candidate=sat_candidate)
    
    # Dump to JSON and reload to primitive python types (avoids numpy.float32 Pydantic/FastAPI crashes)
    summary_dict = json.loads(summary.json())
    
    if req.data_mode == "HISTORICAL_INCIDENT":
        try:
            wakashio_tl = wakashio_adapter.fetch_timeline()
            # Let's weave them in or just replace
            summary_dict["timeline"] = wakashio_tl
        except Exception as e:
            print("Failed to fetch Wakashio timeline:", e)
            
    response["investigation_summary"] = summary_dict
    response["results"] = [json.loads(r.json()) for r in results]
        
    return response
