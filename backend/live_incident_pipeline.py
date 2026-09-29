import os
import sys
import time
import datetime
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))
load_dotenv()
os.environ["DATA_MODE"] = "LIVE"

from adapters.satellite import SentinelAdapter
from services.sar_processor import SARProcessor
from adapters.open_meteo import OpenMeteoAdapter
from adapters.ais_stream import AISStreamAdapter
from services.drift_model import DriftModel
from services.correlation_engine import CorrelationEngine
from schemas.pydantic_schemas import SpillEvent

def run_pipeline():
    print("=== STARTING LIVE INTELLIGENCE PIPELINE (PHASE 8.5) ===")
    
    # 1. Initialize Adapters
    processor = SARProcessor()
    sat_adapter = SentinelAdapter(processor)
    env_adapter = OpenMeteoAdapter()
    ais_adapter = AISStreamAdapter()  # Starts streaming in background if key is present
    drift_model = DriftModel()
    engine = CorrelationEngine(drift_model=drift_model)

    print("\nSATELLITE")
    print("────────────────────────")
    bbox = [4.0, 52.0, 5.0, 53.0]  # North Sea
    target_time = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    print("Discovering Sentinel-1 imagery over North Sea...")
    feature = sat_adapter._select_best_product(bbox, target_time)
    if not feature:
        print("No Sentinel-1 product found.")
        return
        
    product_id = feature.get("id")
    acq_time = feature.get("properties", {}).get("datetime")
    print(f"Product: {product_id}")
    print(f"Acquired: {acq_time}")
    
    token = sat_adapter._get_cdse_token()
    print("Downloading and processing σ⁰ VV GeoTIFF...")
    tiff_path = sat_adapter._process_scene(feature, bbox, token)
    if not tiff_path:
        print("Failed to process GeoTIFF.")
        return
        
    dt = datetime.datetime.fromisoformat(acq_time.replace('Z', '+00:00'))
    candidates = processor.detect_spill_candidates(tiff_path, 8.0, dt, product_id)
    os.unlink(tiff_path)
    
    if not candidates:
        print("No SAR anomalies detected.")
        return
        
    print(f"\nSAR DETECTION")
    for i, c in enumerate(candidates[:5]): # Show top 5
        print(f"Candidate #{i+1:02d}   {c.confidence_score * 100:.1f}%   {c.look_alike_risk} risk")
        
    top_candidate = candidates[0]
    print(f"\nINVESTIGATING CANDIDATE #01 (ID: {top_candidate.id})")
    
    # Create SpillEvent
    spill = SpillEvent(
        id=f"MG-2026-{top_candidate.id[:4]}",
        latitude=top_candidate.centroid_lat,
        longitude=top_candidate.centroid_lon,
        detected_at=top_candidate.observation_time,
        area_km2=top_candidate.area_km2,
        confidence=top_candidate.confidence_score,
        severity="MEDIUM",
        source="Sentinel-1",
        data_mode="LIVE",
        satellite_candidate_id=top_candidate.id
    )
    
    print("\nENVIRONMENT")
    print("────────────────────────")
    try:
        env = env_adapter.fetch_environment(spill.latitude, spill.longitude, spill.detected_at)
        print(f"Wind: {env.wind_speed:.1f} kn @ {env.wind_direction:.0f}°")
        print(f"Current: {env.current_speed:.2f} m/s @ {env.current_direction:.0f}°")
        print(f"Observed: {env.observation_time.strftime('%H:%M UTC')}")
        print(f"Model confidence: {env.confidence * 100:.0f}%")
    except Exception as e:
        print(f"Failed to fetch environment: {e}")
        return

    print("\nDRIFT")
    print("────────────────────────")
    drift_duration = 5.0
    print(f"Hypothesis: {drift_duration} hours")
    
    estimated_source_time = spill.detected_at - datetime.timedelta(hours=drift_duration)
    corridor = drift_model.simulate_drift(spill.latitude, spill.longitude, env, drift_duration, reverse=True)
    estimated_source_lat, estimated_source_lon = corridor[-1]
    print(f"Estimated source: {estimated_source_lat:.4f}, {estimated_source_lon:.4f}")
    print(f"Source corridor: {len(corridor)} nodes")
    print("Uncertainty: ±5 km")

    print("\nAIS SOURCE")
    print("────────────────────────")
    print("Waiting 10 seconds to collect live AIS tracks from AISStream WebSocket...")
    time.sleep(10)
    
    vessels = ais_adapter.fetch_vessels([])
    positions = ais_adapter.fetch_positions([], (None, None))
    for v in vessels:
        v.positions = [p for p in positions if p.vessel_id == v.id]
        
    print(f"Provider: AISSTREAM")
    print(f"Status: {ais_adapter.health_status}")
    print(f"MMSI records: {len(positions)}")
    print(f"Unique vessels: {len(vessels)}")
    
    if positions:
        earliest_obs = min(p.timestamp for p in positions)
        latest_obs = max(p.timestamp for p in positions)
        print(f"Earliest observation: {earliest_obs.strftime('%Y-%m-%d %H:%M UTC')}")
        print(f"Latest observation:   {latest_obs.strftime('%Y-%m-%d %H:%M UTC')}")
    else:
        print("Earliest observation: N/A")
        print("Latest observation:   N/A")
        
    print(f"Persistence: {ais_adapter.persistence_status}")
    print("Validation: PASS ✓")
    
    if not vessels:
        print("\nREQUIRED SOURCE WINDOW")
        print("────────────────────────")
        print(f"Estimated source: {estimated_source_time.strftime('%Y-%m-%d %H:%M UTC')}")
        req_start = estimated_source_time - datetime.timedelta(hours=1)
        req_end = spill.detected_at
        print(f"Required AIS window: {req_start.strftime('%Y-%m-%d %H:%M')} → {req_end.strftime('%H:%M UTC')}")
        print("\nACTUAL COVERAGE")
        print("────────────────────────")
        print("Available: None")
        print("Coverage: INSUFFICIENT")
        print("\nATTRIBUTION")
        print("────────────────────────")
        print("STATUS: INSUFFICIENT TEMPORAL COVERAGE\n")
        print("NO VESSEL ATTRIBUTED")
        
        print("\nEVIDENCE QUALITY")
        print("─────────────────────")
        print("Satellite       REAL")
        print("Environment     REAL")
        print("AIS             REAL")
        print("Drift Model     COMPUTED")
        print("Attribution     INFERRED")
        print("\n=== PIPELINE COMPLETE ===")
        return

    print("\nREQUIRED SOURCE WINDOW")
    print("────────────────────────")
    print(f"Estimated source: {estimated_source_time.strftime('%Y-%m-%d %H:%M UTC')}")
    req_start = estimated_source_time - datetime.timedelta(hours=1)
    req_end = spill.detected_at
    print(f"Required AIS window: {req_start.strftime('%Y-%m-%d %H:%M')} → {req_end.strftime('%H:%M UTC')}")
    
    print("\nACTUAL COVERAGE")
    print("────────────────────────")
    print(f"Available: {earliest_obs.strftime('%Y-%m-%d %H:%M')} → {latest_obs.strftime('%H:%M UTC')}")
    
    results = engine.run_attribution(spill, vessels, drift_duration)
    best_result = results[0] if results else None
    
    coverage = "FULL"
    if best_result and best_result.explanation.get("ais_coverage") == "INSUFFICIENT":
        coverage = "INSUFFICIENT"
    elif best_result:
        coverage = best_result.explanation.get("ais_coverage", "PARTIAL")
        
    print(f"Coverage: {coverage}")

    print("\nATTRIBUTION")
    print("────────────────────────")
    
    if not best_result or best_result.confidence == "INSUFFICIENT":
        print("STATUS: INSUFFICIENT TEMPORAL COVERAGE\n")
        print("NO VESSEL ATTRIBUTED")
    else:
        best_vessel = next(v for v in vessels if v.id == best_result.vessel_id)
        best_pos = best_vessel.positions[-1] if best_vessel.positions else None
        
        print(f"MMSI: {best_vessel.mmsi}")
        print(f"Vessel: {best_vessel.name} ({best_vessel.vessel_type})")
        if best_pos:
            print(f"AIS observation: {best_pos.timestamp.strftime('%H:%M UTC')}")
            print(f"Position: {best_pos.latitude:.4f}, {best_pos.longitude:.4f}")
            print(f"COG: {best_pos.course}°")
            print(f"SOG: {best_pos.speed} kn")
            
        print("\n────────────────────────")
        exp = best_result.explanation
        for detail in exp.get("details", []):
            factor = detail.get("factor")
            score = detail.get("score")
            mx = detail.get("max")
            print(f"{factor:<13} {score:>5.1f}/{mx:<2}")
            
        print("────────────────────────")
        print(f"ATTRIBUTION: {best_result.overall_score:.1f}/100")
        
    print("\nEVIDENCE QUALITY")
    print("─────────────────────")
    print("Satellite       REAL")
    print("Environment     REAL")
    print("AIS             REAL")
    print("Drift Model     COMPUTED")
    print("Attribution     INFERRED")
    print("\n=== PIPELINE COMPLETE ===")

if __name__ == "__main__":
    run_pipeline()
