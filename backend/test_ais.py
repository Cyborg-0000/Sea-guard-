import time
import os
from dotenv import load_dotenv
from adapters.ais_stream import AISStreamAdapter
import json

load_dotenv()

# We need to test the ais adapter
print("Starting AIS Adapter test...")
api_key = os.getenv("AISSTREAM_API_KEY")
if not api_key:
    print("NO AISSTREAM_API_KEY CONFIGURED.")
else:
    print(f"Using API Key: {api_key[:4]}...{api_key[-4:] if len(api_key)>8 else ''}")

adapter = AISStreamAdapter()

print("Waiting 15 seconds for websocket messages...")
time.sleep(15)

print(f"Health Status: {adapter.health_status}")
print(f"Connected: {adapter._connected}")

positions = adapter.fetch_positions([], (None, None))
print(f"Total positions received: {len(positions)}")
vessels = adapter.fetch_vessels([])
print(f"Total unique vessels in buffer: {len(vessels)}")

tankers = [v for v in vessels if "tanker" in v.vessel_type.lower()]
print(f"Tankers found (by naive string matching): {len(tankers)}")
if tankers:
    for t in tankers:
        print(f" - {t.name} (MMSI: {t.mmsi}) Type: {t.vessel_type}")
        # count history length
        hist = [p for p in positions if p.vessel_id == t.id]
        print(f"   History: {len(hist)} observations")

print("Done.")
