import json
import uuid
import math
from datetime import datetime, timedelta

def get_point_at_distance(lat, lon, distance_km, bearing_degrees):
    R = 6371.0 # Earth radius in km
    lat_rad = math.radians(lat)
    lon_rad = math.radians(lon)
    bearing_rad = math.radians(bearing_degrees)

    new_lat_rad = math.asin(math.sin(lat_rad) * math.cos(distance_km / R) +
                            math.cos(lat_rad) * math.sin(distance_km / R) * math.cos(bearing_rad))
    new_lon_rad = lon_rad + math.atan2(math.sin(bearing_rad) * math.sin(distance_km / R) * math.cos(lat_rad),
                                       math.cos(distance_km / R) - math.sin(lat_rad) * math.sin(new_lat_rad))

    return math.degrees(new_lat_rad), math.degrees(new_lon_rad)

def main():
    spill_id = str(uuid.uuid4())
    vessel_a_id = str(uuid.uuid4())
    vessel_b_id = str(uuid.uuid4())
    vessel_c_id = str(uuid.uuid4())

    detection_time = datetime(2026, 8, 26, 14, 32, 0)
    spill_lat = 18.421
    spill_lon = 66.213

    spills = [{
        "id": spill_id,
        "name": "Incident #001 - Arabian Sea Anomaly",
        "latitude": spill_lat,
        "longitude": spill_lon,
        "detected_at": detection_time.isoformat() + "Z",
        "area_km2": 7.4,
        "confidence": 0.91,
        "severity": "HIGH",
        "source": "Sentinel-1",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[spill_lon - 0.05, spill_lat - 0.05], [spill_lon + 0.05, spill_lat - 0.05],
                             [spill_lon + 0.05, spill_lat + 0.05], [spill_lon - 0.05, spill_lat + 0.05],
                             [spill_lon - 0.05, spill_lat - 0.05]]]
        },
        "satellite_image_url": "/demo_sar.png",
        "status": "DETECTED",
        "provenance": {
            "source": "Sentinel-1",
            "timestamp": detection_time.isoformat() + "Z",
            "location": f"{spill_lat}, {spill_lon}",
            "data_type": "SAR_RASTER",
            "confidence": 0.91
        }
    }]

    vessels = [
        {
            "id": vessel_a_id,
            "mmsi": "111111111",
            "imo": "IMO111",
            "name": "Ocean Voyager",
            "vessel_type": "Cargo",
            "flag": "Panama",
            "length": 150.0
        },
        {
            "id": vessel_b_id,
            "mmsi": "222222222",
            "imo": "IMO222",
            "name": "Crimson Tanker",
            "vessel_type": "Tanker",
            "flag": "Liberia",
            "length": 300.0
        },
        {
            "id": vessel_c_id,
            "mmsi": "333333333",
            "imo": "IMO333",
            "name": "Blue Horizon",
            "vessel_type": "Fishing",
            "flag": "Spain",
            "length": 45.0
        }
    ]

    positions = []
    
    # Drift vector assumption: drift is heading 180 (South) at approx 1 km/h
    # Meaning 5 hours ago (09:32), the source was ~5km North (bearing 0) of the current spill.
    source_lat, source_lon = get_point_at_distance(spill_lat, spill_lon, 5.0, 0.0)

    # Vessel B (Far but correct)
    # Passed exactly through the source region at 09:30
    # Traveling East-South-East (bearing 110) at 20 km/h (approx 10.8 knots)
    # By 14:32, it will be 5 hours later -> 100 km away from source! (Or we can make it 24km away)
    # Let's make the speed slower, e.g. 5 km/h -> 25km away.
    vessel_b_speed_kmh = 5.0
    for hour_offset in range(-6, 2): # from 08:32 to 15:32
        pos_time = detection_time + timedelta(hours=hour_offset)
        dist_from_source = vessel_b_speed_kmh * (hour_offset + 5) # at -5 hr (09:32), dist is 0
        p_lat, p_lon = get_point_at_distance(source_lat, source_lon, dist_from_source, 110.0)
        positions.append({
            "id": str(uuid.uuid4()),
            "vessel_id": vessel_b_id,
            "timestamp": pos_time.isoformat() + "Z",
            "latitude": p_lat,
            "longitude": p_lon,
            "speed": vessel_b_speed_kmh * 0.539957, # knots
            "course": 110.0,
            "heading": 110.0
        })

    # Vessel A (Close but wrong)
    # Passed very close to the spill (8km West) at 10:00 (too early for drift)
    # Heading North (bearing 0)
    for hour_offset in range(-6, 2):
        pos_time = detection_time + timedelta(hours=hour_offset)
        # At 14:32 (hour 0), let's say it is 8km from spill
        # at 10:00 (-4.5 hrs), it was somewhere else.
        # Let's just place it statically 8km West at 14:32, moving North at 10 km/h
        dist_from_1432 = 10.0 * hour_offset
        ref_lat, ref_lon = get_point_at_distance(spill_lat, spill_lon, 8.0, 270.0)
        p_lat, p_lon = get_point_at_distance(ref_lat, ref_lon, dist_from_1432, 0.0)
        positions.append({
            "id": str(uuid.uuid4()),
            "vessel_id": vessel_a_id,
            "timestamp": pos_time.isoformat() + "Z",
            "latitude": p_lat,
            "longitude": p_lon,
            "speed": 10.0 * 0.539957,
            "course": 0.0,
            "heading": 0.0
        })

    # Vessel C (Distractor)
    for hour_offset in range(-6, 2):
        pos_time = detection_time + timedelta(hours=hour_offset)
        ref_lat, ref_lon = get_point_at_distance(spill_lat, spill_lon, 50.0, 90.0)
        p_lat, p_lon = get_point_at_distance(ref_lat, ref_lon, 15.0 * hour_offset, 180.0)
        positions.append({
            "id": str(uuid.uuid4()),
            "vessel_id": vessel_c_id,
            "timestamp": pos_time.isoformat() + "Z",
            "latitude": p_lat,
            "longitude": p_lon,
            "speed": 15.0 * 0.539957,
            "course": 180.0,
            "heading": 180.0
        })

    with open('data/demo/spills.json', 'w') as f:
        json.dump(spills, f, indent=2)
    with open('data/demo/vessels.json', 'w') as f:
        json.dump(vessels, f, indent=2)
    with open('data/demo/vessel_positions.json', 'w') as f:
        json.dump(positions, f, indent=2)

    print("Demo data generated successfully.")

if __name__ == "__main__":
    main()
