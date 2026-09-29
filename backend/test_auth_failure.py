import time
import os
os.environ["AISSTREAM_API_KEY"] = "INVALID_KEY_FOR_TESTING_123"

from adapters.ais_stream import AISStreamAdapter

print("Initializing adapter...")
adapter = AISStreamAdapter()

print("Waiting 10 seconds for background thread to attempt connection...")
time.sleep(10)

print("Adapter health:", adapter.health_status)
print("Finished test.")
