# SATILITE (MarineGuard) System Architecture

This document provides a comprehensive overview of the SATILITE (MarineGuard) platform architecture, data flows, and operational mechanics. It is intended for onboarding new agents and developers to understand the project structure and capabilities.

## Overview

SATILITE is a full-stack web application designed for real-time and historical monitoring of marine environments. Its primary purpose is to track oil-transporting vessels in real time via live AIS telemetry, detect satellite-observed oil spills (using SAR data from Sentinel-1), and run forensic correlation algorithms to identify source vessels through environmental drift modelling.

## 1. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  EXTERNAL DATA SOURCES                                                   │
│                                                                          │
│  AISStream.io   (wss://stream.aisstream.io/v0/stream)                    │
│  OpenMeteo API  (https://api.open-meteo.com)                             │
│  CDSE / Copernicus  (Sentinel-1 SAR imagery)                             │
└────────────────────┬─────────────────────────────────────────────────────┘
                     │ websocket / REST
                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  BACKEND  (FastAPI / Python — port 8000)                                 │
│                                                                          │
│  Adapters            Services                 API Layer                  │
│  ───────────────     ──────────────────────   ────────────────────────   │
│  AISStreamAdapter    SARProcessor             /api/ws/vessels/live  ←WS  │
│  OpenMeteoAdapter    DriftModel               /api/vessels/oil-cargo/live│
│  SentinelAdapter     CorrelationEngine        /api/incidents/scan        │
│  HistoricalAIS       InvestigationEngine      /api/incidents/investigate │
│  WakashioAdapter                              /api/incidents/correlate   │
│                                               /api/ais/diagnostics       │
│  Thread-safe vessel registry (dict + Lock)                               │
│  SQLite DB (WAL mode) via SQLAlchemy                                     │
└────────────────────┬─────────────────────────────────────────────────────┘
                     │ WebSocket (ws://)  +  REST (http://)
                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  FRONTEND  (React + Vite — port 5173)                                    │
│                                                                          │
│  App.tsx  ──WebSocket──▶ vessel state  ──▶  MapView.tsx                  │
│           ──REST──────▶ spills/env     ──▶  BottomDashboard.tsx          │
│                                             IncidentTimeline.tsx         │
│  Map engine: MapLibre GL JS                                              │
│  Styling:   Vanilla CSS + PostCSS                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

The system has **three data modes**, selectable from the UI:

| Mode | AIS Source | SAR Source | Use Case |
|------|-----------|------------|----------|
| `LIVE` | AISStream.io WebSocket | Copernicus CDSE (real) | Operational monitoring |
| `HISTORICAL_INCIDENT` | Wakashio CSV fixture | Simulated SAR fixture | MV Wakashio 2020 case study |
| `DEMO` / `HISTORICAL` | Generated demo data | Simulated candidates | UI demonstrations |

## 2. Directory Structure

```text
e:\SATILITE\
├── backend/
│   ├── adapters/
│   │   ├── ais_stream.py          # Live AIS: single WebSocket consumer thread,
│   │   │                          #   tanker registry (type 80-89), diagnostics
│   │   ├── ais_historical.py      # Historical AIS CSV loader
│   │   ├── wakashio_adapter.py    # MV Wakashio 2020 offline fixture
│   │   ├── open_meteo.py          # Live wind/current from OpenMeteo
│   │   ├── env_historical.py      # Historical environment fixture
│   │   ├── satellite.py           # SentinelAdapter (CDSE) + DemoSatelliteAdapter
│   │   ├── demo.py                # Demo data generators
│   │   └── base.py                # BaseAISAdapter / BaseEnvironmentAdapter
│   │
│   ├── api/
│   │   └── router.py              # All FastAPI routes + WebSocket endpoint
│   │
│   ├── database/
│   │   └── session.py             # SQLAlchemy engine + WAL mode
│   │
│   ├── schemas/
│   │   └── pydantic_schemas.py    # Pydantic V2 models (SpillEvent, Vessel, …)
│   │
│   ├── services/
│   │   ├── sar_processor.py       # Lee-filter, adaptive threshold, land mask
│   │   ├── drift_model.py         # Leeway drift + corridor simulation
│   │   ├── correlation_engine.py  # Spatial-temporal vessel attribution
│   │   └── investigation_engine.py# Evidence graph builder
│   │
│   ├── utils/
│   │   └── vector.py              # Geo/math utilities
│   │
│   ├── main.py                    # FastAPI app factory, CORS, router mount
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── MapView.tsx         # MapLibre map, tanker markers, track lines
│   │   │   └── BottomDashboard.tsx # Spill cards, investigation panels
│   │   └── App.tsx                 # WebSocket client, mode switching, state
│   ├── postcss.config.js
│   └── package.json
│
├── data/
│   └── historical/
│       └── wakashio/               # MV Wakashio AIS CSV + SAR metadata fixture
│
├── scripts/
│   └── generate_demo_data.py       # Demo AIS/spill data generator
│
└── ARCHITECTURE.md                 # This file
```

## 3. Live AIS Vessel Tracking — Verified Data Path

The following end-to-end data path has been **confirmed with runtime evidence** (2026-09-22):

```
AISStream.io WebSocket
  wss://stream.aisstream.io/v0/stream
        │  (single persistent backend thread — never one per browser client)
        ▼
AISStreamAdapter._run()                         [backend/adapters/ais_stream.py]
  • Subscribes: BoundingBoxes = English Channel [49°N–52°N, -5°W–3°E]
  • Decodes PositionReport  → updates track[] in registry
  • Decodes ShipStaticData  → classifies vessel_type_code 80-89 as tanker
  • Thread-safe: all registry writes hold threading.Lock
        │
        ▼
Vessel Registry (in-process dict)
  { mmsi: { name, imo, classification, is_tanker, track[], heading, … } }
        │
        ▼
FastAPI WebSocket  /api/ws/vessels/live         [backend/api/router.py]
  • Requires uvicorn[standard] + websockets installed
  • Polls registry every 2 s, serialises tankers-only to JSON
  • Sends: { vessels: [...], total: N, ais_status: "CONNECTED" }
        │  ws://localhost:8000/api/ws/vessels/live
        ▼
App.tsx — native browser WebSocket              [frontend/src/App.tsx]
  • Connects on mount (LIVE mode), exponential-backoff reconnect
  • Normalises: track[{lat,lon,sog,cog}] → positions[{latitude,longitude,speed,course}]
  • Calls setVessels(normalized)
        │
        ▼
MapView.tsx                                     [frontend/src/components/MapView.tsx]
  • Vessel marker at latest position
  • Observed LineString from accumulated track points
```

**Confirmed live tankers (sample, 2026-09-22):**

| Vessel | MMSI | Position | Speed |
|--------|------|----------|-------|
| IONIAN SEA | 636025668 | 50.31°N, 0.12°E | 12.6 kts |
| MARAN THULE | 311001011 | 49.87°N, -2.57°W | 8.6 kts |
| BALTIC | 219032007 | 49.66°N, -3.84°W | 11.2 kts |
| LAMU | 636024787 | 51.97°N, 1.81°E | 6.7 kts |
| GOLDEN OLIVE | 636024469 | 49.47°N, 0.54°E | moored |

> ⚠️ **Critical dependency:** uvicorn must be started **with** `uvicorn[standard]` (`websockets` library).  
> Without it, every WebSocket upgrade silently returns HTTP 404.

---

## 4. SAR Oil Spill Detection Pipeline

### 4.1 SARProcessor (`backend/services/sar_processor.py`)

1. **Ingest:** Reads a GeoTIFF (sigma-nought backscatter, pre-calibrated dB).
2. **Speckle filter:** Lee filter (3×3 kernel) reduces SAR granular noise.
3. **Land mask:** `global-land-mask` library masks all non-ocean pixels.
4. **Adaptive threshold:** Per-scene mean − N·σ; anomalously dark pixels are candidates.
5. **Region labelling:** `scipy.ndimage.label` groups connected dark pixels into blobs.
6. **Area filtering:** Blobs < 0.1 km² or > 200 km² are discarded.
7. **Look-alike rejection:** Wind speed penalty — low-wind calm areas are false positives.
8. **Confidence scoring:** `anomaly_strength + shape_compatibility − environmental_penalty`.

### 4.2 Data Modes

- **LIVE:** Queries CDSE catalog → downloads real Sentinel-1 GeoTIFF → runs SARProcessor. Falls back to a simulated candidate on auth failure.
- **HISTORICAL_INCIDENT:** Returns Wakashio fixture geometry (IOPC Fund reports). Labelled `SIMULATED_HISTORICAL`.
- **DEMO:** Returns mock candidates from the spill adapter.

---

## 5. Forensic Investigation Engine

Three-step workflow triggered after a SAR candidate is selected:

### Step 1 — SCAN (`POST /api/incidents/scan`)
Returns satellite candidate with centroid, area, confidence, and look-alike risk.

### Step 2 — INVESTIGATE (`POST /api/incidents/investigate`)
- Fetches live/historical wind and current from OpenMeteo.
- Runs `DriftModel.simulate_drift()` in **reverse** for `duration_hours` to produce the *Source Corridor*.

### Step 3 — CORRELATE (`POST /api/incidents/correlate`)
- Queries the AIS registry (live) or CSV (historical).
- `CorrelationEngine.run_attribution()` scores every vessel by spatial proximity to the Source Corridor, speed/heading compatibility, and temporal coverage.
- Returns ranked `AttributionResult` list (score 0–100) with explanation dict.

---

## 6. Operational Notes

### Dependencies

| Component | Key Runtime Requirement |
|-----------|------------------------|
| Backend WebSocket | `pip install "uvicorn[standard]" websockets` |
| SAR processing | `rasterio`, `scipy`, `global-land-mask`, `shapely` |
| ORM | `SQLAlchemy` (SQLite WAL) |
| AIS stream | `websocket-client` (backend thread) |
| Frontend | Node ≥ 18, `maplibre-gl`, Vite 5+ |

### Starting the Stack

```bash
# Backend (from e:\SATILITE\backend\)
.\venv\Scripts\uvicorn.exe main:app --host 0.0.0.0 --port 8000

# Frontend (from e:\SATILITE\frontend\)
npm run dev
```

### Diagnostics
`GET /api/ais/diagnostics` — stream health, registry size, tanker counts, sample tanker.  
Use this to verify the AIS pipeline before debugging the frontend.

### Concurrency Model
- AIS registry protected by `threading.Lock` (one writer thread, many async reader coroutines).
- SQLite in WAL mode for concurrent FastAPI reads and background writes.

---

## 7. Environment Variables (`.env` in `backend/`)

| Variable | Purpose |
|----------|--------|
| `AISSTREAM_API_KEY` | AISStream.io API key (backend-only, never exposed to frontend) |
| `CDSE_USERNAME` | Copernicus CDSE username |
| `CDSE_PASSWORD` | Copernicus CDSE password |
| `DATABASE_URL` | SQLAlchemy connection string (default: `sqlite:///./marineguard.db`) |
