import pytest
from datetime import datetime, timezone
import httpx
from adapters.open_meteo import OpenMeteoAdapter
from unittest.mock import patch, MagicMock

@pytest.fixture
def adapter():
    return OpenMeteoAdapter()

def mock_weather_response(time_iso="2026-08-27T11:00", speed=20.0, direction=250.0):
    return {
        "latitude": 18.4,
        "longitude": 66.2,
        "current": {
            "time": time_iso,
            "wind_speed_10m": speed,
            "wind_direction_10m": direction
        },
        "hourly": {
            "time": [time_iso],
            "wind_speed_10m": [speed],
            "wind_direction_10m": [direction]
        }
    }

def mock_marine_response(time_iso="2026-08-27T11:00", speed_kmh=1.8, direction=120.0):
    return {
        "latitude": 18.4,
        "longitude": 66.2,
        "current": {
            "time": time_iso,
            "ocean_current_velocity": speed_kmh,
            "ocean_current_direction": direction
        },
        "hourly": {
            "time": [time_iso],
            "ocean_current_velocity": [speed_kmh],
            "ocean_current_direction": [direction]
        }
    }

def test_fetch_live_environment_success(adapter):
    with patch.object(adapter, '_fetch_concurrently') as mock_fetch:
        mock_fetch.return_value = (mock_weather_response(), mock_marine_response())
        
        env = adapter.fetch_live_environment(18.4, 66.2)
        
        assert env.wind_speed == 20.0
        assert env.wind_direction == 250.0
        # 1.8 km/h = 0.5 m/s
        assert env.current_speed == 0.5
        assert env.current_direction == 120.0
        assert env.source == "OPEN_METEO"
        assert env.data_mode == "LIVE"
        assert adapter.health_status == "CONNECTED"
        
        assert env.observation_time.tzinfo == timezone.utc
        assert env.retrieved_at.tzinfo == timezone.utc
        assert env.observation_time != env.retrieved_at

def test_fetch_environment_historical_success(adapter):
    with patch.object(adapter, '_fetch_concurrently') as mock_fetch:
        mock_fetch.return_value = (mock_weather_response(), mock_marine_response())
        
        target_time = datetime(2026, 8, 27, 11, 15, tzinfo=timezone.utc)
        env = adapter.fetch_environment(18.4, 66.2, target_time)
        
        assert env.data_mode == "HISTORICAL"
        assert env.observation_time.hour == 11
        assert env.observation_time.tzinfo == timezone.utc

def test_partial_failure_weather_down(adapter):
    """When weather API is down, adapter returns DEGRADED partial observation with None wind fields.
    It must NOT raise — it must return a usable (but partial) observation.
    It must NOT set wind fields to 0 — None means truly unavailable."""
    with patch.object(adapter, '_fetch_concurrently') as mock_fetch:
        mock_fetch.return_value = (None, mock_marine_response())
        
        env = adapter.fetch_live_environment(18.4, 66.2)
        
        assert adapter.health_status == "DEGRADED"
        assert env.completeness == "PARTIAL"
        assert env.status == "DEGRADED"
        assert "ocean_current" in env.available_components
        assert "wind" in env.missing_components
        # Critical: wind must be None, NOT 0
        assert env.wind_speed is None, "Missing wind must be None, not 0"
        assert env.wind_direction is None, "Missing wind_direction must be None, not 0"
        # Current should be present
        assert env.current_speed is not None
        assert env.confidence < 0.5  # confidence reduced for partial data

def test_partial_failure_marine_down(adapter):
    """When marine API is down, adapter returns DEGRADED partial observation with None current fields.
    It must NOT raise — it must return a usable (but partial) observation.
    It must NOT set current fields to 0 — None means truly unavailable."""
    with patch.object(adapter, '_fetch_concurrently') as mock_fetch:
        mock_fetch.return_value = (mock_weather_response(), None)
        
        env = adapter.fetch_live_environment(18.4, 66.2)
        
        assert adapter.health_status == "DEGRADED"
        assert env.completeness == "PARTIAL"
        assert env.status == "DEGRADED"
        assert "wind" in env.available_components
        assert "ocean_current" in env.missing_components
        # Critical: current must be None, NOT 0
        assert env.current_speed is None, "Missing current_speed must be None, not 0"
        assert env.current_direction is None, "Missing current_direction must be None, not 0"
        # Wind should be present
        assert env.wind_speed is not None
        assert env.confidence < 0.5  # confidence reduced for partial data

def test_full_failure(adapter):
    with patch.object(adapter, '_fetch_concurrently') as mock_fetch:
        mock_fetch.return_value = (None, None)
        
        with pytest.raises(RuntimeError, match="unavailable"):
            adapter.fetch_live_environment(18.4, 66.2)
            
        assert adapter.health_status == "UNAVAILABLE"

def test_caching(adapter):
    with patch.object(adapter, '_fetch_concurrently') as mock_fetch:
        mock_fetch.return_value = (mock_weather_response(), mock_marine_response())
        
        target_time = datetime(2026, 8, 27, 11, 15, tzinfo=timezone.utc)
        
        # First call fetches data
        adapter.fetch_environment(18.4, 66.2, target_time)
        assert mock_fetch.call_count == 1
        
        # Second call to exact same params should hit cache
        adapter.fetch_environment(18.4, 66.2, target_time)
        assert mock_fetch.call_count == 1  # Still 1
        
        # Slightly different timestamp that produces same cache key? (No, timestamp is in cache key)
        # However, testing live cache:
        adapter.fetch_live_environment(18.4, 66.2)
        assert mock_fetch.call_count == 2
        
        # Another live request should hit cache (TTL is 300s)
        adapter.fetch_live_environment(18.4, 66.2)
        assert mock_fetch.call_count == 2
