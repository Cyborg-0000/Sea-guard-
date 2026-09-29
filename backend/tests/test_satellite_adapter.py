import pytest
import os
import httpx
from unittest.mock import patch, MagicMock
from adapters.satellite import SentinelAdapter
from services.sar_processor import SARProcessor

def test_sentinel_adapter_auth_success():
    """Test successful OAuth token exchange."""
    processor = SARProcessor()
    
    with patch.dict(os.environ, {'CDSE_CLIENT_ID': 'fake', 'CDSE_CLIENT_SECRET': 'fake'}):
        with patch('httpx.post') as mock_post, patch('httpx.get') as mock_get:
            # Mock STAC health check
            mock_get.return_value.status_code = 200
            
            # Mock Token response
            mock_post.return_value.status_code = 200
            mock_post.return_value.json.return_value = {"access_token": "valid_token"}
            
            adapter = SentinelAdapter(processor)
            assert adapter.health_status == "CONNECTED"
            assert adapter._get_cdse_token() == "valid_token"

def test_sentinel_adapter_auth_failure():
    """Test when OAuth fails."""
    processor = SARProcessor()
    
    with patch.dict(os.environ, {'CDSE_CLIENT_ID': 'fake', 'CDSE_CLIENT_SECRET': 'fake'}):
        with patch('httpx.post') as mock_post, patch('httpx.get') as mock_get:
            # STAC is up, but Auth fails
            mock_get.return_value.status_code = 200
            mock_post.return_value.status_code = 401
            
            adapter = SentinelAdapter(processor)
            assert adapter.health_status == "DEGRADED"

def test_sentinel_adapter_deterministic_selection():
    """Test that it selects the product intersecting the AOI and closest to target time."""
    processor = SARProcessor()
    adapter = SentinelAdapter(processor)
    
    stac_mock = {
        "features": [
            {"id": "S1_BAD_TIME", "properties": {"datetime": "2026-08-28T00:00:00Z"}},
            {"id": "S1_GOOD_TIME", "properties": {"datetime": "2026-08-28T10:00:00Z"}},
        ]
    }
    
    with patch.object(adapter, 'discover_products', return_value=stac_mock):
        feature = adapter._select_best_product([0, 0, 1, 1], "2026-08-28T10:30:00Z")
        assert feature["id"] == "S1_GOOD_TIME"

@patch('adapters.satellite.SentinelAdapter._process_scene')
@patch('adapters.satellite.SentinelAdapter._select_best_product')
@patch('adapters.satellite.SentinelAdapter.discover_products')
@patch('adapters.satellite.SentinelAdapter._get_cdse_token')
@patch('os.unlink')
def test_sentinel_adapter_zero_candidates(mock_unlink, mock_token, mock_discover, mock_select, mock_process):
    """Test that a processed scene with 0 candidates is handled correctly without throwing an error."""
    processor = SARProcessor()
    
    with patch.object(processor, 'detect_spill_candidates', return_value=[]):
        adapter = SentinelAdapter(processor)
        adapter.health_status = "CONNECTED"
        
        mock_token.return_value = "valid_token"
        mock_discover.return_value = {"features": [{"id": "S1_MOCK"}]}
        mock_select.return_value = {"id": "S1_MOCK"}
        
        # Process returns a fake path
        mock_process.return_value = "fake_path.tif"
        
        # Bypass rasterio sanity check
        with patch('rasterio.open'):
            candidates = adapter.fetch_spill_candidates([0,0,1,1], 5.0)
            
        assert candidates == []
        assert adapter.health_status == "CONNECTED" # Status remains CONNECTED
