"""
Tests for AIS Validator — Phase 8.3
"""
import pytest
from datetime import datetime, timezone, timedelta
from services.ais_validator import AISValidator, MAX_VESSEL_SPEED_KNOTS, SUSPICIOUS_SPEED_KNOTS
from schemas.pydantic_schemas import VesselPosition


def make_pos(vessel_id="v1", lat=18.0, lon=66.0, speed=8.0, course=180.0,
             timestamp=None, pid=None):
    if timestamp is None:
        timestamp = datetime.now(timezone.utc)
    if pid is None:
        pid = f"pos-{lat}-{lon}"
    return VesselPosition(
        id=pid,
        vessel_id=vessel_id,
        timestamp=timestamp,
        latitude=lat,
        longitude=lon,
        speed=speed,
        course=course,
        heading=course,
        data_mode="DEMO_REPLAY",
        confidence=1.0,
        retrieved_at=datetime.now(timezone.utc),
    )


v = AISValidator()


# --- Coordinate validation ---

def test_valid_coordinates():
    v.validate_coordinate(18.421, 66.213, "pos1")  # Should not raise

def test_invalid_latitude_too_high():
    with pytest.raises(ValueError, match="latitude"):
        v.validate_coordinate(91.0, 66.0, "pos1")

def test_invalid_latitude_too_low():
    with pytest.raises(ValueError, match="latitude"):
        v.validate_coordinate(-91.0, 66.0, "pos1")

def test_invalid_longitude():
    with pytest.raises(ValueError, match="longitude"):
        v.validate_coordinate(18.0, 181.0, "pos1")


# --- Timestamp validation ---

def test_aware_timestamp_ok():
    ts = datetime.now(timezone.utc)
    result = v.validate_timestamp(ts, "pos1")
    assert result.tzinfo is not None

def test_naive_timestamp_rejected():
    ts = datetime.now()  # naive
    with pytest.raises(ValueError, match="Naive datetime"):
        v.validate_timestamp(ts, "pos1")


# --- Deduplication ---

def test_deduplication_removes_exact_duplicates():
    now = datetime.now(timezone.utc)
    p1 = make_pos(lat=18.0, lon=66.0, timestamp=now, pid="a")
    p2 = make_pos(lat=18.0, lon=66.0, timestamp=now, pid="b")  # same vessel, time, coords
    p3 = make_pos(lat=18.1, lon=66.0, timestamp=now, pid="c")  # different lat
    result = v.deduplicate([p1, p2, p3])
    assert len(result) == 2


# --- Freshness ---

def test_freshness_fresh():
    now = datetime.now(timezone.utc)
    recent = now - timedelta(seconds=30)
    assert v.get_freshness_status(recent, now) == "FRESH"

def test_freshness_degraded():
    now = datetime.now(timezone.utc)
    mid = now - timedelta(seconds=300)  # 5 min
    assert v.get_freshness_status(mid, now) == "DEGRADED"

def test_freshness_stale():
    now = datetime.now(timezone.utc)
    old = now - timedelta(seconds=700)  # > 10 min
    assert v.get_freshness_status(old, now) == "STALE"


# --- Impossible movement ---

def test_normal_movement_ok():
    t0 = datetime(2026, 8, 26, 18, 0, 0, tzinfo=timezone.utc)
    t1 = t0 + timedelta(hours=1)
    p0 = make_pos(lat=18.0, lon=66.0, timestamp=t0, pid="a")
    p1 = make_pos(lat=18.1, lon=66.0, timestamp=t1, pid="b")  # ~11 km in 1 hr = ~6 kn
    warn = v.check_impossible_movement(p0, p1)
    assert warn is None

def test_impossible_movement_flagged():
    t0 = datetime(2026, 8, 26, 18, 0, 0, tzinfo=timezone.utc)
    t1 = t0 + timedelta(minutes=1)
    p0 = make_pos(lat=18.0, lon=66.0, timestamp=t0, pid="a")
    p1 = make_pos(lat=20.0, lon=66.0, timestamp=t1, pid="b")  # ~222 km in 1 min = ~7200 kn
    warn = v.check_impossible_movement(p0, p1)
    assert warn is not None
    assert warn.code == "IMPOSSIBLE_MOVEMENT"
    assert MAX_VESSEL_SPEED_KNOTS == 100.0  # threshold is centralized

def test_suspicious_movement_flagged():
    # 1.0 degree lat = ~111km in 1 hour = ~60 knots (suspicious but < hard limit of 100kn)
    t0 = datetime(2026, 8, 26, 18, 0, 0, tzinfo=timezone.utc)
    t1 = t0 + timedelta(hours=1)
    p0 = make_pos(lat=18.0, lon=66.0, timestamp=t0, pid="a")
    p1 = make_pos(lat=19.0, lon=66.0, timestamp=t1, pid="b")  # ~111 km in 1 hr = ~60 kn
    warn = v.check_impossible_movement(p0, p1)
    assert warn is not None
    assert warn.code == "SUSPICIOUS_MOVEMENT"
    assert SUSPICIOUS_SPEED_KNOTS == 50.0  # threshold centralized in ais_validator.py


# --- Demo regression: DemoAIS must still validate OK ---

def test_demo_ais_positions_pass_validation():
    """All demo AIS positions must pass coordinate and timestamp validation."""
    import json, os
    data_path = os.path.join(os.path.dirname(__file__), '../../../data/demo/vessel_positions.json')
    if not os.path.exists(data_path):
        pytest.skip("Demo data not found")
    with open(data_path) as f:
        positions_data = json.load(f)
    for p in positions_data:
        v.validate_coordinate(p['latitude'], p['longitude'], p['id'])
        ts = datetime.fromisoformat(p['timestamp'].replace('Z', '+00:00'))
        v.validate_timestamp(ts, p['id'])
