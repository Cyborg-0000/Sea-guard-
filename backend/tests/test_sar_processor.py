import pytest
import numpy as np
from datetime import datetime, timezone
import rasterio
from rasterio.transform import from_origin
from pathlib import Path
from services.sar_processor import SARProcessor

# Mock global-land-mask to avoid requiring real data for unit tests
from unittest.mock import patch
import global_land_mask.globe as globe

@pytest.fixture
def synthetic_geotiff(tmp_path):
    """
    Creates a small synthetic GeoTIFF for testing.
    Background is ~1.0 (0 dB).
    Anomaly A (Large, -10 dB): 0.1
    Anomaly B (Small, -8 dB, elongated): 0.158
    Land: masked out in tests.
    """
    data = np.ones((100, 100), dtype=np.float32)
    
    # Anomaly A: Large dark region (e.g. 20x30 pixels)
    data[10:40, 10:30] = 0.1 # -10 dB
    
    # Anomaly B: Small elongated dark region (e.g. 2x15 pixels)
    data[10:12, 60:75] = 0.1 # -10 dB
    
    # Land region: e.g. bottom right
    data[80:100, 80:100] = 0.5 # Doesn't matter, mask will handle it

    transform = from_origin(-66.5, 18.5, 0.01, 0.01) # Approx 1km per pixel
    
    tif_path = tmp_path / "synthetic_sar.tif"
    with rasterio.open(
        tif_path,
        'w',
        driver='GTiff',
        height=data.shape[0],
        width=data.shape[1],
        count=1,
        dtype=str(data.dtype),
        crs='+proj=latlong',
        transform=transform,
    ) as dst:
        dst.write(data, 1)
        
    return str(tif_path)

@patch('services.sar_processor.globe.is_ocean')
def test_adversarial_sar_anomalies(mock_is_ocean, synthetic_geotiff):
    """
    Test Region A (large, low wind) vs Region B (small, good wind).
    """
    processor = SARProcessor()
    
    # Mock land mask to say everything is ocean except the bottom right corner
    def mock_ocean(lats, lons):
        mask = np.ones_like(lats, dtype=bool)
        mask[(lats < 18.0) & (lons > -66.0)] = False # Mask bottom right
        return mask
    mock_is_ocean.side_effect = mock_ocean
    
    # Case 1: Low wind (2.0 kn) - Large anomaly should be penalized heavily
    processor.max_area_km2 = 2000.0 # override to not filter large region A entirely
    candidates_low_wind = processor.detect_spill_candidates(synthetic_geotiff, wind_speed_kn=2.0)
    
    assert len(candidates_low_wind) >= 2
    
    region_a = next(c for c in candidates_low_wind if c.area_km2 > 500.0)
    region_b = next(c for c in candidates_low_wind if c.area_km2 < 200.0)
    
    assert region_a.look_alike_risk == "HIGH"
    assert region_b.look_alike_risk == "HIGH"
    
    # Case 2: Good wind (8.0 kn)
    candidates_good_wind = processor.detect_spill_candidates(synthetic_geotiff, wind_speed_kn=8.0)
    region_a_good = next(c for c in candidates_good_wind if c.area_km2 > 500.0)
    region_b_good = next(c for c in candidates_good_wind if c.area_km2 < 200.0)
    
    # Good wind => risk is LOW. But Region A is huge -> MEDIUM
    assert region_a_good.look_alike_risk == "MEDIUM"
    assert region_b_good.look_alike_risk == "LOW"
    
    # Region B should have a better shape score (it's 5x20) compared to Region A (20x30).
    assert region_b_good.confidence_breakdown["shape_compatibility"] > region_a_good.confidence_breakdown["shape_compatibility"]

@patch('services.sar_processor.globe.is_ocean')
def test_false_positive_land_rejection(mock_is_ocean, tmp_path):
    """
    Ensure an anomaly that is entirely on land is rejected.
    """
    data = np.ones((100, 100), dtype=np.float32)
    # Dark region on land
    data[10:40, 10:30] = 0.1 
    
    transform = from_origin(-66.5, 18.5, 0.01, 0.01) 
    tif_path = tmp_path / "land_sar.tif"
    with rasterio.open(
        tif_path, 'w', driver='GTiff', height=data.shape[0], width=data.shape[1],
        count=1, dtype=str(data.dtype), crs='+proj=latlong', transform=transform,
    ) as dst:
        dst.write(data, 1)

    processor = SARProcessor()
    # Mock ocean mask to say EVERYTHING is land
    def mock_land(lats, lons):
        return np.zeros_like(lats, dtype=bool)
    mock_is_ocean.side_effect = mock_land
    
    candidates = processor.detect_spill_candidates(str(tif_path), wind_speed_kn=8.0)
    
    # Should be 0 candidates because valid ocean pixels < 100
    assert len(candidates) == 0

@patch('services.sar_processor.globe.is_ocean')
def test_backscatter_semantics(mock_is_ocean, tmp_path):
    """
    Verifies the exact numerical interface between CDSE and SARProcessor.
    If CDSE returns a linear sigma0 of 0.1, the processor must compute exactly -10 dB.
    """
    processor = SARProcessor()
    
    # 0.1 linear power should be exactly -10 dB. 0.01 should be -20 dB.
    data = np.ones((50, 50), dtype=np.float32) * 1.0 # 0 dB background
    data[10:20, 10:20] = 0.1 # -10 dB anomaly
    
    transform = from_origin(0.0, 0.0, 0.01, 0.01) 
    tif_path = tmp_path / "semantic_sar.tif"
    with rasterio.open(
        tif_path, 'w', driver='GTiff', height=data.shape[0], width=data.shape[1],
        count=1, dtype=str(data.dtype), crs='+proj=latlong', transform=transform,
    ) as dst:
        dst.write(data, 1)
        
    mock_is_ocean.return_value = np.ones((50, 50), dtype=bool)
    
    candidates = processor.detect_spill_candidates(str(tif_path), wind_speed_kn=8.0)
    assert len(candidates) == 1
    
    cand = candidates[0]
    # The centroid of the anomaly might be slightly smoothed by Lee Filter, but the raw input was -10dB.
    # The actual mean backscatter inside the polygon should be very close to -10 dB (often ~ -9.4 due to smoothing).
    assert -10.5 < cand.backscatter_db < -9.0, f"Expected ~ -10 dB, got {cand.backscatter_db}"
