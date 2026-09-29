"""
Try alternative CDSE OData endpoint for Sentinel-1 product search.
"""
import httpx, json, os

odata_url = 'https://catalogue.dataspace.copernicus.eu/odata/v1/Products'

# Mauritius: bbox 57.5,-20.7,58.0,-20.1
filter_strs = [
    ("aug10", "2020-08-09T00:00:00.000Z", "2020-08-11T23:59:59.000Z"),
    ("aug16", "2020-08-15T00:00:00.000Z", "2020-08-17T23:59:59.000Z"),
    ("aug22", "2020-08-21T00:00:00.000Z", "2020-08-23T23:59:59.000Z"),
]

all_results = {}
for label, start, end in filter_strs:
    filter_q = (
        f"Collection/Name eq 'SENTINEL-1' "
        f"and ContentDate/Start gt {start!r} and ContentDate/Start lt {end!r} "
        f"and OData.CSC.Intersects(area=geography'SRID=4326;POLYGON((57.5 -20.7,58.0 -20.7,58.0 -20.1,57.5 -20.1,57.5 -20.7))')"
    )
    params = {
        '$filter': filter_q,
        '$top': 5,
        '$select': 'Id,Name,ContentDate,Footprint,S3Path'
    }
    try:
        r = httpx.get(odata_url, params=params, timeout=20)
        print(f'[{label}] Status: {r.status_code}')
        if r.status_code == 200:
            data = r.json()
            items = data.get('value', [])
            print(f'[{label}] Found: {len(items)} products')
            all_results[label] = []
            for item in items:
                entry = {
                    'id': item.get('Id'),
                    'name': item.get('Name'),
                    'start': item.get('ContentDate', {}).get('Start'),
                    's3path': item.get('S3Path')
                }
                print(f"  NAME: {entry['name']}")
                print(f"  DATE: {entry['start']}")
                all_results[label].append(entry)
        else:
            print(f'[{label}] Error: {r.text[:400]}')
            all_results[label] = {'error': r.status_code}
    except Exception as e:
        print(f'[{label}] Exception: {e}')

# Save without credentials
out = 'data/historical/wakashio/satellite/sentinel1/product_discovery.json'
with open(out, 'w') as f:
    json.dump(all_results, f, indent=2)
print(f'\nSaved: {out}')
