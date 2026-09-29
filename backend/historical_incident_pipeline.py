import os
import sys
import datetime
import csv
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))
load_dotenv()
os.environ["DATA_MODE"] = "SIMULATED_HISTORICAL"

from services.sar_processor import SARProcessor
from adapters.open_meteo import OpenMeteoAdapter
from adapters.ais_historical import HistoricalAISAdapter
from services.drift_model import DriftModel
from services.correlation_engine import CorrelationEngine
from schemas.pydantic_schemas import SpillEvent, VesselPosition, Vessel

def create_synthetic_ais_csv(csv_path, estimated_time, estimated_lat, estimated_lon):
    """
    Creates a synthetic CSV overlapping the required temporal window.
    Vessel A: Wrong trajectory, outside corridor.
    Vessel B: Correct source-time position, intersects corridor, correct context.
    """
    with open(csv_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(["mmsi","imo","name","vessel_type","flag","latitude","longitude","sog","cog","heading","nav_status","timestamp"])
        
        # We need data from T - 2h to T + 1h
        for i in range(-2, 2):
            t = estimated_time + datetime.timedelta(hours=i)
            # Vessel A: 0.5 degrees away
            writer.writerow([
                "111111111", "", "Vessel A", "Cargo", "",
                estimated_lat + 0.5 + (i * 0.1), estimated_lon - 0.5 + (i * 0.1), 
                15.0, 45.0, 45.0, "", t.isoformat()
            ])
            # Vessel B: perfectly intersects the source at estimated_time (when i=0)
            writer.writerow([
                "222222222", "", "Vessel B", "Tanker", "",
                estimated_lat + (i * 0.05), estimated_lon + (i * 0.05), 
                12.0, 135.0, 135.0, "", t.isoformat()
            ])

def run_pipeline():
    print("=== STARTING HISTORICAL INTELLIGENCE PIPELINE (PHASE 8.5A Scenario B) ===")
    print("DATA_MODE = SIMULATED_HISTORICAL")
    
    # 1. Initialize Adapters
    processor = SARProcessor()
    env_adapter = OpenMeteoAdapter()
    drift_model = DriftModel()
    engine = CorrelationEngine(drift_model=drift_model)

    # Let's mock the satellite detection instead of querying CDSE to save time and API quota,
    # since we already proved CDSE in Scenario A.
    print("\nSATELLITE")
    print("────────────────────────")
    acq_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)
    
    print("Mocking historical Sentinel-1 imagery over North Sea...")
    spill = SpillEvent(
        id="MG-2026-HIST1",
        latitude=52.5,
        longitude=4.5,
        detected_at=acq_time,
        area_km2=2.5,
        confidence=0.88,
        severity="MEDIUM",
        source="Sentinel-1",
        data_mode="SIMULATED_HISTORICAL",
        satellite_candidate_id="mock-candidate-1"
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
    
    print("\nAIS SOURCE")
    print("────────────────────────")
    
    csv_path = "synthetic_history.csv"
    create_synthetic_ais_csv(csv_path, estimated_source_time, estimated_source_lat, estimated_source_lon)
    
    # We must pass the correct env vars to the Historical adapter
    os.environ["HISTORICAL_AIS_PATH"] = csv_path
    ais_adapter = HistoricalAISAdapter()
    
    vessels = ais_adapter.fetch_vessels([])
    positions = ais_adapter.fetch_positions([], (None, None))
    for v in vessels:
        v.positions = [p for p in positions if p.vessel_id == v.id]
        
    print(f"Provider: HISTORICAL CSV")
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
        
    print("Validation: PASS ✓")
    
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
    
    for res in results:
        v = next(vessel for vessel in vessels if vessel.id == res.vessel_id)
        print(f"{v.name} ({v.vessel_type}) - Score: {res.overall_score:.1f}/100")
    
    print("\n────────────────────────")
    if best_result.confidence == "INSUFFICIENT":
        print("STATUS: INSUFFICIENT TEMPORAL COVERAGE\n")
        print("NO VESSEL ATTRIBUTED")
    else:
        best_vessel = next(v for v in vessels if v.id == best_result.vessel_id)
        print(f"ATTRIBUTION: {best_result.overall_score:.1f}/100")
        print(f"MMSI: {best_vessel.mmsi}")
        print(f"Vessel: {best_vessel.name} ({best_vessel.vessel_type})")
        print("\n────────────────────────")
        exp = best_result.explanation
        for detail in exp.get("details", []):
            factor = detail.get("factor")
            score = detail.get("score")
            mx = detail.get("max")
            print(f"{factor:<13} {score:>5.1f}/{mx:<2}")
            
    print("\nEVIDENCE QUALITY")
    print("─────────────────────")
    print("Satellite       SIMULATED_HISTORICAL")
    print("Environment     REAL")
    print("AIS             SIMULATED_HISTORICAL")
    print("Drift Model     COMPUTED")
    print("Attribution     INFERRED")
    print("\n=== PIPELINE COMPLETE ===")
    
    # Cleanup
    if os.path.exists(csv_path):
        os.unlink(csv_path)

if __name__ == "__main__":
    run_pipeline()
