import json
import csv
import os
from datetime import datetime, timezone, timedelta
import numpy as np
import rasterio
from rasterio.transform import from_origin

BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "historical", "wakashio")
os.makedirs(os.path.join(BASE_DIR, "satellite"), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "sentinel2"), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "environment"), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "ais"), exist_ok=True)

# 1. Incident Profile
incident = {
    "id": "INC-WAKASHIO-2020",
    "name": "MV Wakashio Grounding & Spill",
    "location": "Pointe d'Esny, Mauritius",
    "latitude": -20.438119,
    "longitude": 57.744631,
    "detected_at": "2020-07-25T16:00:00Z",
    "status": "HISTORICAL RECONSTRUCTION",
    "provenance": "REAL_HISTORICAL",
    "source": "Official IMO / Panama Maritime Authority incident reports"
}
with open(os.path.join(BASE_DIR, "incident.json"), "w") as f:
    json.dump(incident, f, indent=2)

# 2. Timeline
timeline = [
    {
        "id": "t1",
        "timestamp": "2020-07-25T16:00:00Z",
        "title": "GROUNDING",
        "description": "MV Wakashio runs aground on coral reef.",
        "type": "HISTORICAL FACT",
        "provenance": "REAL_HISTORICAL"
    },
    {
        "id": "t2",
        "timestamp": "2020-08-06T10:30:00Z",
        "title": "INITIAL LEAK DETECTED",
        "description": "First major oil leak observed.",
        "type": "HISTORICAL FACT",
        "provenance": "REAL_HISTORICAL"
    },
    {
        "id": "t3",
        "timestamp": "2020-08-07T06:12:00Z",
        "title": "SPILL SPREADING",
        "description": "Sentinel-1 observation shows growing SAR anomaly.",
        "type": "OBSERVATION",
        "provenance": "SIMULATED_HISTORICAL",
        "satellite_scene_id": "S1A_IW_GRDH_1SDV_20200807T061200_SIM"
    },
    {
        "id": "t4",
        "timestamp": "2020-08-10T14:45:00Z",
        "title": "COASTAL ACCUMULATION",
        "description": "Sentinel-2 optical observation showing coastline impact.",
        "type": "OBSERVATION",
        "provenance": "SIMULATED_HISTORICAL"
    },
    {
        "id": "t5",
        "timestamp": "2020-08-15T09:00:00Z",
        "title": "VESSEL BREAKUP",
        "description": "MV Wakashio hull splits in two.",
        "type": "HISTORICAL FACT",
        "provenance": "REAL_HISTORICAL"
    }
]
with open(os.path.join(BASE_DIR, "timeline.json"), "w") as f:
    json.dump(timeline, f, indent=2)

# 3. Satellite (Synthetic TIFF for offline demo)
def generate_synthetic_sar():
    width, height = 256, 256
    res = 0.0001
    lon_start, lat_start = 57.7300, -20.4200
    transform = from_origin(lon_start, lat_start, res, res)
    
    # Ocean background
    data = np.random.normal(-18.0, 2.0, (height, width)).astype(np.float32)
    
    # Draw simulated oil spill (dark patch)
    cy, cx = 150, 100
    y, x = np.ogrid[:height, :width]
    mask = ((x - cx)**2 / 40**2) + ((y - cy)**2 / 80**2) <= 1
    data[mask] = np.random.normal(-24.0, 1.0, data[mask].shape)
    
    scene_id = "S1A_IW_GRDH_1SDV_20200807T061200_SIM"
    tif_path = os.path.join(BASE_DIR, "satellite", f"{scene_id}.tif")
    
    with rasterio.open(
        tif_path,
        'w',
        driver='GTiff',
        height=height,
        width=width,
        count=1,
        dtype=data.dtype,
        crs='EPSG:4326',
        transform=transform,
    ) as dst:
        dst.write(data, 1)

    metadata = {
        "id": scene_id,
        "acquisition_time": "2020-08-07T06:12:00Z",
        "polarization": "VV",
        "processing": "Sigma0 VV",
        "provenance": "SIMULATED_HISTORICAL",
        "notes": "SIMULATED_HISTORICAL SAR FIXTURE. Real asset unavailable in offline sandbox.",
        "bbox": [lon_start, lat_start - (height*res), lon_start + (width*res), lat_start]
    }
    with open(os.path.join(BASE_DIR, "satellite", f"{scene_id}.json"), "w") as f:
        json.dump(metadata, f, indent=2)

generate_synthetic_sar()

# 4. AIS Data (Synthetic Wakashio track leading to grounding)
ais_path = os.path.join(BASE_DIR, "ais", "wakashio.csv")
with open(ais_path, "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["mmsi", "imo", "name", "vessel_type", "flag", "latitude", "longitude", "sog", "cog", "heading", "nav_status", "timestamp", "provenance"])
    
    base_time = datetime(2020, 7, 24, 0, 0, tzinfo=timezone.utc)
    base_lat = -20.000
    base_lon = 58.500
    
    for i in range(40):
        dt = base_time + timedelta(hours=i)
        lat = base_lat - (i * 0.011) # moves south-west
        lon = base_lon - (i * 0.019)
        writer.writerow([
            "352746000", "9206994", "WAKASHIO", "Bulk Carrier", "Panama",
            f"{lat:.4f}", f"{lon:.4f}", "11.5", "230.0", "232.0", "0",
            dt.strftime("%Y-%m-%dT%H:%M:%SZ"), "SIMULATED_HISTORICAL"
        ])
    # Grounding point
    dt = datetime(2020, 7, 25, 16, 0, tzinfo=timezone.utc)
    writer.writerow([
        "352746000", "9206994", "WAKASHIO", "Bulk Carrier", "Panama",
        "-20.4381", "57.7446", "0.0", "230.0", "230.0", "1",
        dt.strftime("%Y-%m-%dT%H:%M:%SZ"), "SIMULATED_HISTORICAL"
    ])

# 5. Environment Data (Synthetic ERA5)
env_path = os.path.join(BASE_DIR, "environment", "observations.csv")
with open(env_path, "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["latitude", "longitude", "timestamp", "wind_speed", "wind_direction", "current_speed", "current_direction", "provenance"])
    
    # Create observations for the spill period (Aug 6 - Aug 15)
    base_time = datetime(2020, 8, 6, 0, 0, tzinfo=timezone.utc)
    for i in range(10 * 24): # 10 days, hourly
        dt = base_time + timedelta(hours=i)
        writer.writerow([
            "-20.4381", "57.7446",
            dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "15.2", "110.0", # wind from ESE
            "0.3", "290.0",  # current to WNW
            "SIMULATED_HISTORICAL"
        ])

print("Wakashio fixtures generated successfully.")
