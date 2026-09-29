import time
import os
import json
from dotenv import load_dotenv
import websocket
import threading

load_dotenv()
api_key = os.environ.get("AISSTREAM_API_KEY", "")

def build_sub(api_key):
    return {
        "APIKey": api_key,
        "BoundingBoxes": [[[-90.0, -180.0], [90.0, 180.0]]],
        "FilterMessageTypes": ["PositionReport", "ShipStaticData"],
    }

msgs = []
def on_message(ws, message):
    msgs.append(message)

def run():
    ws = websocket.WebSocketApp("wss://stream.aisstream.io/v0/stream",
        on_message=on_message,
        on_open=lambda ws: ws.send(json.dumps(build_sub(api_key))))
    ws.run_forever()

print("Starting direct WS connection...")
t = threading.Thread(target=run, daemon=True)
t.start()
time.sleep(5)

print(f"Total messages received: {len(msgs)}")
for m in msgs:
    print(m)
