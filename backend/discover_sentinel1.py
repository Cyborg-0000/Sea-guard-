"""
Query CDSE/Copernicus catalogue for real Sentinel-1 GRD products over Mauritius 
during the Wakashio oil spill period (Aug 2020).
SECURITY: Credentials read from backend .env only. Never printed or exposed.
"""
import httpx, json, os, sys
from dotenv import dotenv_values

cfg = dotenv_values('backend/.env')

# OData search endpoint for Sentinel-1 catalogue
catalogue_url = 'https://catalogue.dataspace.copernicus.eu/resto/api/collections/Sentinel1/search.json'

bbox = '57.5,-20.7,58.0,-20.1'  # Pointe d'Esny, Mauritius

date_windows = [
    ('2020-08-09T00:00:00Z', '2020-08-11T23:59:59Z', 'aug10'),
    ('2020-08-15T00:00:00Z', '2020-08-17T23:59:59Z', 'aug16'),
    ('2020-08-21T00:00:00Z', '2020-08-23T23:59:59Z', 'aug22'),
]

all_results = {}

for start, end, label in date_windows:
    params = {
        'box': bbox,
        'startDate': start,
        'completionDate': end,
        'productType': 'GRD',
        'maxRecords': 5
    }
    try:
        r = httpx.get(catalogue_url, params=params, timeout=20)
        print(f'[{label}] Status: {r.status_code}')
        if r.status_code == 200:
            data = r.json()
            features = data.get('features', [])
            print(f'[{label}] Found {len(features)} products')
            all_results[label] = []
            for feat in features:
                fid = feat.get('id', 'unknown')
                props = feat.get('properties', {})
                entry = {
                    'id': fid,
                    'title': props.get('title', ''),
                    'start_date': props.get('startDate', ''),
                    'platform': props.get('platform', ''),
                    'product_type': props.get('productType', '')
                }
                print(f'  {entry["title"]} / {entry["start_date"]}')
                all_results[label].append(entry)
        else:
            print(f'[{label}] ERROR: {r.text[:300]}')
            all_results[label] = {'error': r.status_code}
    except Exception as e:
        print(f'[{label}] EXCEPTION: {type(e).__name__}: {e}')
        all_results[label] = {'exception': str(e)}

# Save results for reference (no credentials in output)
output_path = 'data/historical/wakashio/satellite/sentinel1/product_discovery.json'
os.makedirs(os.path.dirname(output_path), exist_ok=True)
with open(output_path, 'w') as f:
    json.dump(all_results, f, indent=2)
print(f'\nResults saved to {output_path}')
