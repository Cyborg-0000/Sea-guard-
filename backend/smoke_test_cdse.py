import os
import sys
import datetime
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))

load_dotenv()
os.environ["DATA_MODE"] = "LIVE"

from adapters.satellite import SentinelAdapter
from services.sar_processor import SARProcessor
import rasterio
import numpy as np

def run_smoke_test():
    print("=== CDSE SATELLITE SMOKE TEST ===")
    
    # North Sea AOI Box (highly active Sentinel-1 area)
    bbox = [4.0, 52.0, 5.0, 53.0] 
    target_time = datetime.datetime.now(datetime.timezone.utc).isoformat()
    wind_speed = 8.0 # knots
    
    print(f"AOI BBox: {bbox}")
    print(f"Target Time: {target_time}")
    print("--------------------------------")
    
    processor = SARProcessor()
    adapter = SentinelAdapter(processor)
    
    if adapter.health_status != "CONNECTED":
        print(f"FAILED: Auth status is {adapter.health_status}")
        return
        
    print("Auth Status: CONNECTED")
    token = adapter._get_cdse_token()
    if not token:
        print("FAILED: Could not retrieve token")
        return
        
    print("STAC Discovery: Fetching features...")
    feature = adapter._select_best_product(bbox, target_time)
    if not feature:
        print("FAILED: No intersecting features found.")
        return
        
    product_id = feature.get("id")
    acq_time = feature.get("properties", {}).get("datetime")
    print(f"Selected Product ID: {product_id}")
    print(f"Acquisition Time: {acq_time}")
    
    print("CDSE Processing API: Downloading GeoTIFF...")
    tiff_path = adapter._process_scene(feature, bbox, token)
    if not tiff_path:
        print(f"FAILED: Processing API returned empty/invalid response. Adapter status: {adapter.health_status}")
        return
        
    print(f"GeoTIFF Downloaded to: {tiff_path}")
    
    # Analyze Raster
    print("Analyzing Raster...")
    try:
        with rasterio.open(tiff_path) as src:
            data = src.read(1)
            print(f"Raster Dimensions: {src.width} x {src.height}")
            print(f"Raster CRS: {src.crs}")
            
            # Since backscatter can be 0 at dataMask edges, filter > 0 for stats
            valid_pixels = data[data > 0]
            if len(valid_pixels) > 0:
                print(f"Min Backscatter (linear): {np.min(valid_pixels):.6f}")
                print(f"Max Backscatter (linear): {np.max(valid_pixels):.6f}")
                print(f"Mean Backscatter (linear): {np.mean(valid_pixels):.6f}")
            else:
                print("FAILED: Raster has no valid pixels (dataMask=0 everywhere)")
                return
    except Exception as e:
        print(f"FAILED: Raster sanity check failed: {e}")
        return
        
    # Test SAR Processor
    print("Running SARProcessor...")
    # detect_spill_candidates takes geotiff_path, wind_speed_kn, observation_time, product_id
    try:
        dt = datetime.datetime.fromisoformat(acq_time.replace('Z', '+00:00'))
    except Exception:
        dt = datetime.datetime.now(datetime.timezone.utc)
        
    candidates = processor.detect_spill_candidates(tiff_path, wind_speed, dt, product_id)
    
    print(f"Total SAR Anomalies segmented (Internal SARProcessor logic): Unknown (Encapsulated in processor)")
    print(f"Total Oil-Spill Candidates Generated: {len(candidates)}")
    
    if len(candidates) > 0:
        for idx, c in enumerate(candidates):
            print(f"  Candidate {idx + 1}:")
            print(f"    Confidence: {c.confidence_score}")
            print(f"    Look-alike Risk: {c.look_alike_risk}")
            print(f"    Area: {c.area_km2:.2f} km2")
            print(f"    Backscatter: {c.backscatter_db:.2f} dB")
            
    print("=== SMOKE TEST SUCCESS ===")
    os.unlink(tiff_path)

if __name__ == "__main__":
    run_smoke_test()
