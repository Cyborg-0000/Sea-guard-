import os
import sys
import datetime
import httpx
from dotenv import load_dotenv

load_dotenv()

client_id = os.environ.get("CDSE_CLIENT_ID")
client_secret = os.environ.get("CDSE_CLIENT_SECRET")

print("Testing STAC connection...")
try:
    r = httpx.get("https://stac.dataspace.copernicus.eu/v1/", timeout=10.0)
    print(f"STAC GET /: {r.status_code}")
except Exception as e:
    print(f"STAC Error: {e}")

print("Testing CDSE Token Endpoint...")
try:
    payload = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret
    }
    r = httpx.post("https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token", data=payload, timeout=10.0)
    print(f"Token POST: {r.status_code}")
    if r.status_code == 200:
        token = r.json().get("access_token")
        print(f"Token acquired: {token[:10]}...")
    else:
        print(r.text)
except Exception as e:
    print(f"Token Error: {e}")
