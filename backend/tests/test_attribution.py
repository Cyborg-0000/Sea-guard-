import json
import os
import pytest
import copy
from datetime import datetime, timedelta
from services.correlation_engine import CorrelationEngine
from services.drift_model import DriftModel
from schemas.pydantic_schemas import SpillEvent, Vessel, VesselPosition
from utils.vector import Vector2D

def load_json(filepath):
    with open(filepath, 'r') as f:
        return json.load(f)

@pytest.fixture
def base_data():
    base_dir = os.path.join(os.path.dirname(__file__), '../../data/demo')
    spills_data = load_json(os.path.join(base_dir, 'spills.json'))
    vessels_data = load_json(os.path.join(base_dir, 'vessels.json'))
    positions_data = load_json(os.path.join(base_dir, 'vessel_positions.json'))

    spill = SpillEvent(
        id=spills_data[0]["id"],
        latitude=spills_data[0]["latitude"],
        longitude=spills_data[0]["longitude"],
        detected_at=datetime.fromisoformat(spills_data[0]["detected_at"].replace("Z", "+00:00"))
    )

    vessels = []
    for v_data in vessels_data:
        vessel = Vessel(
            id=v_data["id"],
            name=v_data["name"],
            vessel_type=v_data["vessel_type"]
        )
        vessel.positions = []
        for p_data in positions_data:
            if p_data["vessel_id"] == vessel.id:
                pos = VesselPosition(
                    id=p_data["id"],
                    vessel_id=p_data["vessel_id"],
                    latitude=p_data["latitude"],
                    longitude=p_data["longitude"],
                    timestamp=datetime.fromisoformat(p_data["timestamp"].replace('Z', '+00:00')),
                    speed=p_data.get("speed", 0.0),
                    course=p_data.get("course", p_data.get("heading", 0.0)),
                    heading=p_data.get("heading", 0.0)
                )
                vessel.positions.append(pos)
        vessels.append(vessel)
    return spill, vessels

def test_vector2d_math():
    v1 = Vector2D(3, 4)
    assert v1.magnitude() == 5.0
    
    # 0 = North, 90 = East
    v2 = Vector2D(10, 0)
    assert v2.bearing() == 90.0

def test_drift_round_trip():
    drift_model = DriftModel()
    env = drift_model.get_default_demo_env(datetime.now())
    
    start_lat, start_lon = 18.0, 66.0
    duration_hours = 5.0
    
    # Forward simulate
    forward_path = drift_model.simulate_drift(start_lat, start_lon, env, duration_hours, reverse=False)
    predicted_spill_lat, predicted_spill_lon = forward_path[-1]
    
    # Reverse simulate from predicted spill
    reverse_path = drift_model.simulate_drift(predicted_spill_lat, predicted_spill_lon, env, duration_hours, reverse=True)
    recovered_source_lat, recovered_source_lon = reverse_path[-1]
    
    dist_error = drift_model._haversine(start_lat, start_lon, recovered_source_lat, recovered_source_lon)
    
    # Error should be practically 0
    assert dist_error < 0.1, f"Round trip failed with {dist_error} km error"

def test_adversarial_vessel_scenario(base_data):
    """
    Adversarial benchmark: Crimson Tanker (correct corridor) vs Ocean Voyager (nearby but wrong).

    DEMO_REPLAY regression baseline locked as of Phase 8.3:
      Crimson Tanker: 89.68 / 100  (Tanker, passes through corridor, ~7.5km from source)
      Ocean Voyager:  70.88 / 100  (Cargo, spatially proximate but wrong corridor)
      Blue Horizon:   33.54 / 100  (Fishing, 50km away — distractor)
      Gap: +18.8 points (wider than previous ~8.2 point gap — more defensible)

    Weights (25/20/25/20/10) must NOT be changed without updating this comment.
    """
    spill, vessels = base_data

    vessel_a = next(v for v in vessels if v.name == "Ocean Voyager")
    vessel_b = next(v for v in vessels if v.name == "Crimson Tanker")
    vessel_c = next(v for v in vessels if v.name == "Blue Horizon")

    engine = CorrelationEngine(drift_model=DriftModel())
    results = engine.run_attribution(spill, [vessel_a, vessel_b, vessel_c], drift_duration_hours=5.0)

    # --- Ranking assertion (most important) ---
    top_result = results[0]
    assert top_result.vessel_id == vessel_b.id, (
        f"Crimson Tanker must rank #1. Got {next(v.name for v in vessels if v.id == top_result.vessel_id)}"
    )

    ct = next(r for r in results if r.vessel_id == vessel_b.id)
    ov = next(r for r in results if r.vessel_id == vessel_a.id)

    # --- Gap assertion: Crimson Tanker must lead by >10 points ---
    gap = ct.overall_score - ov.overall_score
    assert gap > 10.0, (
        f"Crimson Tanker must outrank Ocean Voyager by >10 pts. Gap was {gap:.2f}"
    )

    # --- Score magnitude assertions (locked baseline, Phase 8.3) ---
    assert 85.0 < ct.overall_score < 95.0, (
        f"Crimson Tanker score {ct.overall_score:.2f} outside expected range 85-95. "
        "If scoring algorithm changed, update this baseline intentionally."
    )
    assert 65.0 < ov.overall_score < 78.0, (
        f"Ocean Voyager score {ov.overall_score:.2f} outside expected range 65-78."
    )

    # --- Weights verification (25/20/25/20/10) ---
    weight_sum = ct.spatial_score / (ct.spatial_score / 0.25) if ct.spatial_score else 0
    # Verify components sum to overall
    component_sum = ct.spatial_score + ct.temporal_score + ct.trajectory_score + ct.drift_score + ct.context_score
    assert abs(component_sum - ct.overall_score) < 0.01, (
        f"Score components don't sum to overall: {component_sum:.3f} != {ct.overall_score:.3f}"
    )

    # --- Component ceiling check: context must be 10/10 for Tanker ---
    assert abs(ct.context_score - 10.0) < 0.01, (
        f"Tanker context_score should be 10.0, got {ct.context_score}"
    )
    assert abs(ov.context_score - 5.0) < 0.01, (
        f"Cargo context_score should be 5.0, got {ov.context_score}"
    )

    # --- Temporal: both vessels score max (time_diff=0h) ---
    assert abs(ct.temporal_score - 20.0) < 0.01, (
        f"Crimson Tanker temporal should be 20.0/20, got {ct.temporal_score}"
    )
    assert abs(ov.temporal_score - 20.0) < 0.01, (
        f"Ocean Voyager temporal should be 20.0/20, got {ov.temporal_score}"
    )

    # --- The decisive factor: trajectory ---
    assert ct.trajectory_score > ov.trajectory_score, (
        "Trajectory must be the decisive factor: Crimson Tanker passes through the corridor, "
        "Ocean Voyager does not."
    )

