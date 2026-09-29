from dotenv import load_dotenv
load_dotenv()
import asyncio
from adapters.ais_stream import AISStreamAdapter
import time

async def diagnose_ais():
    print("Initializing AIS Adapter...")
    adapter = AISStreamAdapter()
    print("Waiting 15 seconds to collect data...")
    await asyncio.sleep(15)
    
    vessels = adapter.fetch_vessels([])
    positions = adapter.fetch_positions([], (None, None))
    
    print("=== AIS DIAGNOSTIC REPORT ===")
    import os
    api_key_configured = bool(os.getenv("AISSTREAM_API_KEY"))
    print(f"AIS CONFIGURED: {'YES' if api_key_configured else 'NO'}")
    print(f"VALID POSITIONS: {len(positions)}")
    print(f"OIL TANKERS: {len(vessels)}")
    print("=============================")

if __name__ == "__main__":
    asyncio.run(diagnose_ais())
