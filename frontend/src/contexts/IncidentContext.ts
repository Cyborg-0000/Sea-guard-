/**
 * IncidentContext — Authoritative types and constants for MarineGuard incident management.
 * 
 * This is the single source of truth for incident-specific map state.
 * Every mode switch must go through an IncidentContext, not hardcoded coordinates.
 */

export interface HistoricalSatelliteScene {
  id: string;
  satellite: 'SENTINEL-1' | 'SENTINEL-2';
  acquisition_time: string;   // ISO 8601
  product_id?: string;        // Actual CDSE product ID if real; omit if simulated
  bbox: [number, number, number, number]; // [west, south, east, north] — visualization extent only
  asset_url: string;          // Local /historical/... path or external URL
  provenance: 'REAL_HISTORICAL' | 'SIMULATED_HISTORICAL' | 'UNAVAILABLE';
  description: string;
  notes?: string;             // Important caveats (e.g. "processed publication, not raw GeoTIFF")
  source_attribution?: string;
}

export type TimelineEventType =
  | 'BASELINE'
  | 'GROUNDING'
  | 'ASSESSMENT'
  | 'SPILL_START'
  | 'SAR_ACQUISITION'
  | 'OPTICAL_ACQUISITION'
  | 'BREAKUP'
  | 'AFTERMATH'
  // Legacy DEMO_REPLAY types
  | 'SPILL_DETECTED'
  | 'SATELLITE_ACQUISITION'
  | 'SOURCE_CORRIDOR_REVEALED'
  | 'ATTRIBUTION_COMPLETE'
  | 'CANDIDATE_ANALYSIS'
  | 'ENVIRONMENT_OBSERVATION'
  | 'HISTORICAL FACT'
  | 'OBSERVATION';

export interface WakashioTimelineEvent {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  event_type: TimelineEventType;
  provenance: 'REAL_HISTORICAL' | 'SIMULATED_HISTORICAL' | 'COMPUTED';
  satellite_scene_id?: string;
}

export interface WakashioMapFeatures {
  groundingPoint: [number, number];          // [lon, lat]
  spillRegionBbox: [number, number, number, number]; // [west, south, east, north]
  spillPolygon: { type: 'Polygon'; coordinates: number[][][] };
  groundingMarker: [number, number];
}

export interface IncidentContext {
  incidentId: string;
  name: string;
  center: [number, number];       // [longitude, latitude]
  bounds: [[number, number], [number, number]]; // [[sw_lon, sw_lat], [ne_lon, ne_lat]]
  defaultZoom: number;
  satellite_scenes: HistoricalSatelliteScene[];
  timeline?: WakashioTimelineEvent[];
  mapFeatures?: WakashioMapFeatures;
}

// ── WAKASHIO 2020 ────────────────────────────────────────────────────────────
export const WAKASHIO_SATELLITE_SCENES: HistoricalSatelliteScene[] = [
  {
    id: 's1_aug07_sim',
    satellite: 'SENTINEL-1',
    acquisition_time: '2020-08-07T06:12:00Z',
    bbox: [57.68, -20.50, 57.82, -20.37],
    asset_url: '/wakashio_s1_aug07_simulated.jpg',
    provenance: 'SIMULATED_HISTORICAL',
    description: 'SAR acquisition over Pointe d\'Esny (Simulated)',
    notes: 'Real Sentinel-1 GRD product requires CDSE authenticated download. This is a simulated high-res SAR image for orchestrator visualization context.',
  },
  {
    id: 's2_aug11_real',
    satellite: 'SENTINEL-2',
    acquisition_time: '2020-08-11T06:00:00Z',
    bbox: [57.65, -20.52, 57.85, -20.35],
    asset_url: '/wakashio_s2.jpg',
    provenance: 'REAL_HISTORICAL',
    description: 'Sentinel-2 observation (ESA Processed)',
    notes: 'Real Sentinel-2 observation from August 11, 2020, processed by the European Space Agency.',
    source_attribution: 'Copernicus Sentinel Data 2020, processed by ESA',
  },
  {
    id: 's1_aug16_sim',
    satellite: 'SENTINEL-1',
    acquisition_time: '2020-08-16T06:12:00Z',
    bbox: [57.60, -20.55, 57.90, -20.30],
    asset_url: '/demo_sar.jpg',
    provenance: 'SIMULATED_HISTORICAL',
    description: 'SAR acquisition post-breakup (Simulated)',
    notes: 'Real Sentinel-1 GRD product requires CDSE authenticated download. This is a simulated high-res SAR image for orchestrator visualization context.',
  },
];

/** Canonical Wakashio timeline — loaded from JSON but also embedded here for offline/immediate use */
export const WAKASHIO_TIMELINE: WakashioTimelineEvent[] = [
  { id: 't0', timestamp: '2020-07-17T00:00:00Z', title: 'BASELINE', description: 'Baseline clear ocean state prior to incident.', event_type: 'BASELINE', provenance: 'SIMULATED_HISTORICAL' },
  { id: 't1', timestamp: '2020-07-25T16:00:00Z', title: 'GROUNDING', description: 'MV Wakashio runs aground on coral reef at Pointe d\'Esny.', event_type: 'GROUNDING', provenance: 'REAL_HISTORICAL' },
  { id: 't2', timestamp: '2020-08-01T00:00:00Z', title: 'POST-GROUNDING ASSESSMENT', description: 'Vessel remains aground. No significant oil leak observed yet.', event_type: 'ASSESSMENT', provenance: 'REAL_HISTORICAL' },
  { id: 't3', timestamp: '2020-08-06T10:30:00Z', title: 'HULL BREACH / INITIAL LEAK', description: 'First major oil leak observed following hull rupture.', event_type: 'SPILL_START', provenance: 'REAL_HISTORICAL' },
  { id: 't4', timestamp: '2020-08-07T06:12:00Z', title: 'SAR ACQUISITION', description: 'Sentinel-1 SAR observation shows growing anomaly.', event_type: 'SAR_ACQUISITION', provenance: 'SIMULATED_HISTORICAL', satellite_scene_id: 's1_aug07_sim' },
  { id: 't5', timestamp: '2020-08-11T06:00:00Z', title: 'SENTINEL-2 OBSERVATION', description: 'ESA-published Sentinel-2 image reveals extensive oil slick around vessel.', event_type: 'OPTICAL_ACQUISITION', provenance: 'REAL_HISTORICAL', satellite_scene_id: 's2_aug11_real' },
  { id: 't6', timestamp: '2020-08-15T09:00:00Z', title: 'VESSEL BREAKUP', description: 'MV Wakashio hull splits in two.', event_type: 'BREAKUP', provenance: 'REAL_HISTORICAL' },
  { id: 't7', timestamp: '2020-08-16T06:12:00Z', title: 'POST-BREAKUP SAR', description: 'Sentinel-1 SAR acquisition over broken vessel.', event_type: 'SAR_ACQUISITION', provenance: 'SIMULATED_HISTORICAL', satellite_scene_id: 's1_aug16_sim' },
  { id: 't8', timestamp: '2020-08-22T00:00:00Z', title: 'COASTAL AFTERMATH', description: 'Oil accumulation along the coastline.', event_type: 'AFTERMATH', provenance: 'REAL_HISTORICAL' },
];

/** Wakashio geographic features for map visualization */
export const WAKASHIO_MAP_FEATURES: WakashioMapFeatures = {
  groundingPoint: [57.7440, -20.4376],  // Pointe d'Esny reef, verified
  spillRegionBbox: [57.66, -20.50, 57.82, -20.38],
  groundingMarker: [57.7440, -20.4376],
  spillPolygon: {
    type: 'Polygon',
    coordinates: [[
      [57.700, -20.460],
      [57.760, -20.440],
      [57.790, -20.460],
      [57.780, -20.490],
      [57.740, -20.500],
      [57.700, -20.490],
      [57.700, -20.460],
    ]],
  },
};

export const WAKASHIO_INCIDENT_CONTEXT: IncidentContext = {
  incidentId: 'WAKASHIO_2020',
  name: 'MV Wakashio — Pointe d\'Esny, Mauritius (2020)',
  center: [57.744, -20.438],   // Grounding point
  bounds: [[57.50, -20.65], [58.00, -20.20]],
  defaultZoom: 11,
  satellite_scenes: WAKASHIO_SATELLITE_SCENES,
  timeline: WAKASHIO_TIMELINE,
  mapFeatures: WAKASHIO_MAP_FEATURES,
};

// ── DEMO (Crimson Tanker) ─────────────────────────────────────────────────────
export const DEMO_INCIDENT_CONTEXT: IncidentContext = {
  incidentId: 'DEMO_CRIMSON_TANKER',
  name: 'Crimson Tanker — Demo Scenario',
  center: [4.445, 52.39],    // North Sea
  bounds: [[3.5, 51.8], [5.5, 53.0]],
  defaultZoom: 9,
  satellite_scenes: [],
};

// ── LIVE (no fixed incident) ──────────────────────────────────────────────────
export const LIVE_INCIDENT_CONTEXT: IncidentContext = {
  incidentId: 'LIVE',
  name: 'Live Operations',
  center: [0, 20],            // Will be overridden by first SCAN result
  bounds: [[-180, -90], [180, 90]],
  defaultZoom: 4,
  satellite_scenes: [],
};

export function getIncidentContext(dataMode: string): IncidentContext {
  switch (dataMode) {
    case 'HISTORICAL_INCIDENT': return WAKASHIO_INCIDENT_CONTEXT;
    case 'DEMO_REPLAY':         return DEMO_INCIDENT_CONTEXT;
    case 'LIVE':                return LIVE_INCIDENT_CONTEXT;
    default:                    return LIVE_INCIDENT_CONTEXT;
  }
}

export function getActiveSatelliteScene(
  timeline: WakashioTimelineEvent[],
  currentTime: number,
  scenes: HistoricalSatelliteScene[]
): HistoricalSatelliteScene | null {
  const activeEvents = [...timeline]
    .filter(e => {
      const t = new Date(e.timestamp).getTime();
      return t <= currentTime && e.satellite_scene_id;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  const activeSceneId = activeEvents[0]?.satellite_scene_id;
  if (!activeSceneId) return null;
  return scenes.find(s => s.id === activeSceneId) || null;
}
