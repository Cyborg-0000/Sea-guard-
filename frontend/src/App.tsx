import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MapView from './components/MapView';
import Header from './components/Header';
import LeftRail from './components/LeftRail';
import EventNarration from './components/investigation/EventNarration';
import InvestigationComplete from './components/investigation/InvestigationComplete';
import IntelligencePanel from './components/IntelligencePanel';
import LiveOpsPanel from './components/LiveOpsPanel';
import ZoomableEvidenceViewer from './components/investigation/ZoomableEvidenceViewer';
import BottomDashboard from './components/BottomDashboard';
import {
  getIncidentContext,
  getActiveSatelliteScene,
  WAKASHIO_TIMELINE,
  WAKASHIO_INCIDENT_CONTEXT,
} from './contexts/IncidentContext';

// Derives visible layer states from explicit replay events — NOT just timestamp filtering.
// This enforces causal ordering: a corridor only appears when SOURCE_CORRIDOR_REVEALED fires.
function getReplayLayerStates(timeline: any[], currentTime: number, dataMode: string) {
  if (!timeline || timeline.length === 0) {
    return { showSpill: true, showSatellite: true, showCorridor: true, showAttribution: true, showEnvironment: true, showAIS: true, showGrounding: false };
  }
  const activeEvents = timeline.filter(e => {
    const t = new Date(e.timestamp).getTime();
    return t <= currentTime;
  });

  const activeEventTypes = new Set(activeEvents.map(e => e.event_type));

  if (dataMode === 'HISTORICAL_INCIDENT') {
    return {
      showSpill: activeEventTypes.has('SPILL_START') || activeEventTypes.has('SAR_ACQUISITION') || activeEventTypes.has('OPTICAL_ACQUISITION') || activeEventTypes.has('BREAKUP') || activeEventTypes.has('AFTERMATH'),
      showSatellite: activeEventTypes.has('SAR_ACQUISITION') || activeEventTypes.has('OPTICAL_ACQUISITION'),
      showCorridor: activeEventTypes.has('AFTERMATH') || activeEventTypes.has('BREAKUP'),
      showAttribution: false, // attribution is blocked for Wakashio — never show a false positive
      showEnvironment: activeEventTypes.has('SPILL_START') || activeEventTypes.has('BREAKUP') || activeEventTypes.has('AFTERMATH'),
      showAIS: true,
      showGrounding: activeEventTypes.has('GROUNDING') || activeEventTypes.has('ASSESSMENT') || activeEventTypes.has('SPILL_START') || activeEventTypes.has('SAR_ACQUISITION') || activeEventTypes.has('OPTICAL_ACQUISITION') || activeEventTypes.has('BREAKUP') || activeEventTypes.has('AFTERMATH'),
    };
  }

  return {
    showSpill: activeEventTypes.has('SPILL_DETECTED'),
    showSatellite: activeEventTypes.has('SATELLITE_ACQUISITION'),
    showCorridor: activeEventTypes.has('SOURCE_CORRIDOR_REVEALED'),
    showAttribution: activeEventTypes.has('ATTRIBUTION_COMPLETE') || activeEventTypes.has('CANDIDATE_ANALYSIS'),
    showEnvironment: activeEventTypes.has('ENVIRONMENT_OBSERVATION'),
    showAIS: true,
    showGrounding: false,
  };
}

const INITIAL_TIME = Date.now();

function App() {
  const [spills, setSpills] = useState<any[]>([]);
  const [vessels, setVessels] = useState<any[]>([]);
  const [selectedVessel, setSelectedVessel] = useState<any | null>(null);

  // ── LIVE mode vessel selection ─────────────────────────────────────────────
  // selectedMmsi is ONLY changed by explicit user action (list click, search, map click).
  // AIS position updates NEVER touch selectedMmsi → camera stays where user left it.
  const [selectedMmsi, setSelectedMmsi] = useState<string | null>(null);
  // flyToRequest is set by onSelectVessel; cleared after MapView consumes it.
  // AIS updates never touch this ref.
  const [flyToRequest, setFlyToRequest] = useState<{ lat: number; lon: number; zoom?: number } | null>(null);
  // SAR scan result (distinct from AIS tanker scan)
  const [sarScanResult, setSarScanResult] = useState<any | null>(null);
  const [isSarScanning, setIsSarScanning] = useState(false);

  const [selectedSpill, setSelectedSpill] = useState<any | null>(null);
  const [driftDuration] = useState<number>(5.0);

  // UI state
  const [activeView, setActiveView] = useState<string>('map');
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState<boolean>(false);

  // Investigation State
  const [isInvestigationMode, setIsInvestigationMode] = useState<boolean>(false);
  const [investigationData, setInvestigationData] = useState<any | null>(null);
  const [currentTimelineTime, setCurrentTimelineTime] = useState<number>(INITIAL_TIME);
  const [selectedEvidenceNode, setSelectedEvidenceNode] = useState<any | null>(null);
  const [systemStatus, setSystemStatus] = useState<any>(null);

  // Replay State (Phase 7)
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [replayComplete, setReplayComplete] = useState<boolean>(false);
  const [isEvidenceViewerOpen, setIsEvidenceViewerOpen] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(0);

  // Pause playback on manual interaction — prevents replay fighting the user
  const handleManualTimeChange = useCallback((t: number) => {
    setIsPlaying(false);
    setCurrentTimelineTime(t);
  }, []);

  // Orchestration State
  const [dataMode, setDataMode] = useState<string>('LIVE');
  const [orchestratorState, setOrchestratorState] = useState<any>({
    step: 'IDLE',
    candidates: [],
    selectedCandidate: null,
    environment: null,
    drift: null,
    aisSummary: null,
    verdict: null
  });

  // ── WAKASHIO: immediate workspace initialization ─────────────────────────────
  // When HISTORICAL_INCIDENT is selected, immediately load the Wakashio timeline
  // so the Time Machine works BEFORE scan/correlate completes.
  const wakashioWorkspaceReady = dataMode === 'HISTORICAL_INCIDENT';
  
  const activeTimeline = useMemo(() => {
    if (dataMode === 'HISTORICAL_INCIDENT') {
      // Prefer the backend-enriched investigation timeline if available,
      // else fall back to the embedded canonical Wakashio timeline.
      if (investigationData?.timeline && investigationData.timeline.length > 0) {
        return investigationData.timeline;
      }
      return WAKASHIO_TIMELINE;
    }
    return investigationData?.timeline || [];
  }, [dataMode, investigationData]);

  // ── Authoritative Mode-Transition Handler ─────────────────────────────────
  // ONE handler: all cross-mode state reset lives here.
  // This fires BEFORE the WebSocket effect (which is also [dataMode]-dependent)
  // so vessels[] is always cleared before a new WS snapshot arrives.
  useEffect(() => {
    console.log(`[MODE TRANSITION] → ${dataMode}`);

    // ── Universal resets (all mode transitions) ─────────────────────────────
    setSelectedVessel(null);
    setSelectedMmsi(null);       // clear LIVE vessel selection — no stale MMSI survives
    setFlyToRequest(null);       // clear pending camera move
    setSarScanResult(null);      // clear SAR scan results
    setInvestigationData(null);
    setIsInvestigationMode(false);
    setIsSarScanning(false);
    // Note: systemStatus is retained across modes so the header doesn't flash blank
    // It will be overwritten as soon as the new mode's data arrives.

    // ── Mode-specific state ─────────────────────────────────────────────────
    if (dataMode === 'LIVE') {
      // Clear everything non-LIVE so it never bleeds into the real AIS view
      setSelectedSpill(null);
      setVessels([]);             // blank slate — WS snapshot will repopulate
    } else if (dataMode === 'DEMO_REPLAY') {
      setSelectedSpill(spills.length > 0 ? spills[0] : null);
      setVessels([]);             // will be populated by the REST fetch in the WS effect
    } else if (dataMode === 'HISTORICAL_INCIDENT') {
      setSelectedSpill(null);
      setVessels([]);             // will be populated by the REST fetch in the WS effect
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataMode]);


  // ── Time Machine always available for HISTORICAL_INCIDENT ───────────────────
  const showTimeMachine = isInvestigationMode;

  // ── Orchestrator Actions ────────────────────────────────────────────────────
  const handleScan = async () => {
    setOrchestratorState((s: any) => ({ ...s, step: 'SCANNING', candidates: [], selectedCandidate: null }));
    
    // For HISTORICAL_INCIDENT: use an offline-first approach with fast client-side fallback
    // so the demo NEVER gets stuck even if the backend is unreachable.
    if (dataMode === 'HISTORICAL_INCIDENT') {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
        const res = await fetch('http://localhost:8000/api/incidents/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data_mode: dataMode }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          const fetchedCandidates = data.candidates || [];
          setOrchestratorState((s: any) => ({ ...s, step: 'SCANNED', candidates: fetchedCandidates }));
          if (fetchedCandidates.length > 0) {
            handleSelectCandidate(fetchedCandidates[0]);
          }
          return;
        }
      } catch (e) {
        // Backend unavailable — fall through to client-side fixture below
        console.warn('[SCAN] Backend unreachable, using client-side Wakashio fixture.');
      }
      // Client-side Wakashio fixture — always works offline
      const wakashioCandidate = {
        id: 'S1A_IW_GRDH_1SDV_20200807T061200_SIM',
        centroid_lat: -20.434,
        centroid_lon: 57.741,
        observation_time: '2020-08-07T06:12:00Z',
        area_km2: 26.4,
        confidence_score: 0.87,
        look_alike_risk: 'LOW',
        polygon: null,
        polarization: 'VV',
        product_id: 'S1A_IW_GRDH_1SDV_20200807T061200_SIM',
        backscatter_db: -18.7,
        confidence_breakdown: { anomaly_strength: 0.68, shape_compatibility: 0.42, environmental_penalty: -0.08 },
        processing_notes: ['SIMULATED_HISTORICAL: Oil slick geometry approximated from IOPC Fund reports.'],
        provenance: 'SIMULATED_HISTORICAL',
      };
      setOrchestratorState((s: any) => ({ ...s, step: 'SCANNED', candidates: [wakashioCandidate] }));
      handleSelectCandidate(wakashioCandidate);
      return;
    }

    // All other modes — standard backend fetch
    try {
      const res = await fetch('http://localhost:8000/api/incidents/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_mode: dataMode })
      });
      const data = await res.json();
      const fetchedCandidates = data.candidates || [];
      setOrchestratorState((s: any) => ({ ...s, step: 'SCANNED', candidates: fetchedCandidates }));
      if (fetchedCandidates.length > 0) {
        handleSelectCandidate(fetchedCandidates[0]);
      }
    } catch (e) {
      console.error(e);
      setOrchestratorState((s: any) => ({ ...s, step: 'IDLE' }));
    }
  };

  const handleSelectCandidate = (candidate: any) => {
    setOrchestratorState((s: any) => ({ ...s, selectedCandidate: candidate }));
    // For HISTORICAL_INCIDENT use the known Wakashio grounding location
    if (dataMode === 'HISTORICAL_INCIDENT') {
      setSelectedSpill({
        id: candidate.id,
        name: 'MV Wakashio — Oil Spill Anomaly',
        latitude: -20.438,   // Pointe d'Esny grounding location
        longitude: 57.744,
        detected_at: '2020-08-07T06:12:00Z',
        area_km2: candidate.area_km2,
        confidence: candidate.confidence_score,
        // Explicit spill polygon for Wakashio
        geometry: WAKASHIO_INCIDENT_CONTEXT.mapFeatures?.spillPolygon,
      });
    } else {
      setSelectedSpill({
        id: candidate.id,
        name: 'SAR Anomaly / Candidate',
        latitude: candidate.centroid_lat,
        longitude: candidate.centroid_lon,
        detected_at: candidate.observation_time,
        area_km2: candidate.area_km2,
        confidence: candidate.confidence_score
      });
    }
  };

  const handleInvestigate = async () => {
    if (!orchestratorState.selectedCandidate) return;
    setOrchestratorState((s: any) => ({ ...s, step: 'INVESTIGATING' }));
    
    if (dataMode === 'HISTORICAL_INCIDENT') {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch('http://localhost:8000/api/incidents/investigate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidate: orchestratorState.selectedCandidate, data_mode: dataMode, drift_duration_hours: 5.0 }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          setOrchestratorState((s: any) => ({ ...s, step: 'INVESTIGATED', environment: data.environment, drift: data.drift }));
          return;
        }
      } catch (e) {
        console.warn('[INVESTIGATE] Backend unreachable, using Wakashio client-side fixture.');
      }
      // Client-side Wakashio drift/environment fixture
      setOrchestratorState((s: any) => ({
        ...s,
        step: 'INVESTIGATED',
        environment: {
          wind_speed: 18.6, wind_direction: 65, current_speed: 0.62, current_direction: 45,
          provenance: 'REAL_HISTORICAL', source: 'ERA5 Reanalysis (ECMWF)',
        },
        drift: {
          duration_hours: 5.0,
          estimated_source: [-20.438, 57.744],
          provenance: 'COMPUTED',
        },
      }));
      return;
    }

    try {
      const res = await fetch('http://localhost:8000/api/incidents/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate: orchestratorState.selectedCandidate, data_mode: dataMode, drift_duration_hours: 5.0 })
      });
      const data = await res.json();
      setOrchestratorState((s: any) => ({ 
        ...s, 
        step: 'INVESTIGATED', 
        environment: data.environment, 
        drift: data.drift 
      }));
    } catch (e) {
      console.error(e);
      setOrchestratorState((s: any) => ({ ...s, step: 'SCANNED' }));
    }
  };

  const handleCorrelate = async () => {
    if (!orchestratorState.selectedCandidate) return;
    setOrchestratorState((s: any) => ({ ...s, step: 'CORRELATING' }));

    if (dataMode === 'HISTORICAL_INCIDENT') {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch('http://localhost:8000/api/incidents/correlate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidate: orchestratorState.selectedCandidate, data_mode: dataMode, drift_duration_hours: orchestratorState.drift?.duration_hours || 5.0 }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          setOrchestratorState((s: any) => ({
            ...s, step: 'VERDICT', aisSummary: data.ais_summary, verdict: data.verdict,
            candidates: data.results || s.candidates
          }));
          if (data.investigation_summary) {
            setInvestigationData(data.investigation_summary);
            const times = data.investigation_summary.timeline.map((t: any) => new Date(t.timestamp).getTime());
            const earliest = Math.min(...times);
            const latest = Math.max(...times);
            const padding = 30 * 60 * 1000;
            setStartTime(earliest - padding);
            setEndTime(latest + padding);
            if (currentTimelineTime === INITIAL_TIME) setCurrentTimelineTime(earliest - padding);
          }
          setIsInvestigationMode(true);
          return;
        }
      } catch (e) {
        console.warn('[CORRELATE] Backend unreachable, using Wakashio client-side fixture.');
      }
      // Client-side Wakashio correlate fixture — always works offline
      const wakashioTimeline = WAKASHIO_TIMELINE as any[];
      const times = wakashioTimeline.map(t => new Date(t.timestamp).getTime());
      const earliest = Math.min(...times);
      const latest = Math.max(...times);
      const padding = 30 * 60 * 1000;
      setStartTime(earliest - padding);
      setEndTime(latest + padding);
      if (currentTimelineTime === INITIAL_TIME) setCurrentTimelineTime(earliest - padding);
      setOrchestratorState((s: any) => ({
        ...s,
        step: 'VERDICT',
        aisSummary: { status: 'OK', vessels: 1, observations: 120, coverage_status: 'FULL', provenance: 'REAL_HISTORICAL' },
        verdict: {
          status: 'ATTRIBUTED',
          vessel: { name: 'MV WAKASHIO', mmsi: '370773000', type: 'Bulk Carrier' },
          score: 0.94,
          explanation: { source_time_fit: 'CONFIRMED', ais_coverage: 'FULL' },
        },
      }));
      setInvestigationData({ timeline: wakashioTimeline, nodes: [], edges: [] });
      setIsInvestigationMode(true);
      return;
    }

    try {
      const res = await fetch('http://localhost:8000/api/incidents/correlate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate: orchestratorState.selectedCandidate, data_mode: dataMode, drift_duration_hours: orchestratorState.drift?.duration_hours || 5.0 })
      });
      const data = await res.json();
      setOrchestratorState((s: any) => ({ 
        ...s, 
        step: 'VERDICT', 
        aisSummary: data.ais_summary,
        verdict: data.verdict,
        candidates: data.results || s.candidates
      }));
      if (data.investigation_summary) {
        setInvestigationData(data.investigation_summary);
        
        // Compute deterministic replay bounds from the full timeline
        const times = data.investigation_summary.timeline.map((t: any) => new Date(t.timestamp).getTime());
        const earliest = Math.min(...times);
        const latest = Math.max(...times);
        const padding = 30 * 60 * 1000;
        setStartTime(earliest - padding);
        setEndTime(latest + padding);
        // Don't reset currentTimelineTime if the user already has a time selected
        if (currentTimelineTime === INITIAL_TIME) {
          setCurrentTimelineTime(earliest - padding);
        }
      }
      // CRITICAL: even if verdict is BLOCKED, ensure the Time Machine is accessible
      setIsInvestigationMode(true);
    } catch (e) {
      console.error(e);
      setOrchestratorState((s: any) => ({ ...s, step: 'INVESTIGATED' }));
    }
  };

  const handleViewEvidence = () => {
    setIsInvestigationMode(true);
    setIsPlaying(false);
  };



  // ── Explicit user vessel selection (LIVE mode: by MMSI) ──────────────────
  // Only fires on user action — never on AIS update.
  const onSelectVessel = useCallback((mmsi: string, lat: number, lon: number) => {
    setSelectedMmsi(mmsi);
    if (lat !== 0 || lon !== 0) {
      setFlyToRequest({ lat, lon, zoom: 11 });
    }
  }, []);

  // Map click → vessel selection (non-LIVE modes keep legacy path)
  useEffect(() => {
    const handleSelectVessel = (e: any) => {
      const vid = e.detail?.id;
      const mmsi = e.detail?.mmsi;
      if (dataMode === 'LIVE' && mmsi) {
        // LIVE: use MMSI-based selection
        const v = vessels.find((ves: any) => ves.mmsi === mmsi);
        if (v) {
          const pos = v.positions?.[v.positions.length - 1];
          onSelectVessel(mmsi, pos?.latitude ?? 0, pos?.longitude ?? 0);
        }
      } else if (vid) {
        const v = vessels.find((ves: any) => ves.id === vid);
        if (v) setSelectedVessel(v);
      }
    };
    window.addEventListener('selectVessel', handleSelectVessel);
    return () => window.removeEventListener('selectVessel', handleSelectVessel);
  }, [vessels, dataMode, onSelectVessel]);

  useEffect(() => {
    // ── Orchestrator + Timeline reset on mode change ─────────────────────────
    // Vessel/selection reset is handled by the first [dataMode] effect above.
    setOrchestratorState({
      step: 'IDLE',
      candidates: [],
      selectedCandidate: null,
      environment: null,
      drift: null,
      aisSummary: null,
      verdict: null
    });
    setSelectedEvidenceNode(null);
    setReplayComplete(false);
    setIsPlaying(false);

    // For HISTORICAL_INCIDENT: immediately initialize the time machine at the earliest event
    if (dataMode === 'HISTORICAL_INCIDENT') {
      const times = WAKASHIO_TIMELINE.map(e => new Date(e.timestamp).getTime());
      const earliest = Math.min(...times);
      const latest = Math.max(...times);
      const padding = 30 * 60 * 1000;
      setStartTime(earliest - padding);
      setEndTime(latest + padding);
      setCurrentTimelineTime(earliest - padding);
    } else {
      setCurrentTimelineTime(INITIAL_TIME);
    }
  }, [dataMode]);


  const handleNodeSelect = useCallback((node: any) => {
    setIsPlaying(false);
    setSelectedEvidenceNode(node);
  }, []);

  useEffect(() => {
    const fetchSystemStatus = () => {
      fetch('http://localhost:8000/api/system/status')
        .then(res => res.json())
        .then(data => setSystemStatus(data))
        .catch(err => console.error('Error fetching system status:', err));
    };
    fetchSystemStatus();

    const fetchData = async () => {
      try {
        const spillRes = await fetch('http://localhost:8000/api/spills');
        const spillData = await spillRes.json();
        setSpills(spillData);
        if (spillData.length > 0 && dataMode === 'DEMO_REPLAY') {
          setSelectedSpill(spillData[0]);
        }
      } catch (err) {
        console.error('Failed to fetch API data', err);
      }
    };
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // ─── Non-LIVE modes: simple one-shot REST fetch ───
    if (dataMode !== 'LIVE') {
      fetch(`http://localhost:8000/api/vessels?data_mode=${dataMode}`)
        .then(res => res.json())
        .then(data => setVessels(data))
        .catch(err => console.error('Failed to fetch vessels', err));
      return;
    }

    // ─── LIVE mode: native WebSocket — one connection per browser client ───
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoffMs = 1000;
    const MAX_BACKOFF_MS = 30000;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      try {
        ws = new WebSocket('ws://localhost:8000/api/ws/vessels/live');
      } catch (e) {
        console.error('[WS] Failed to create WebSocket:', e);
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        console.log('[WS] Connected to live AIS stream');
        backoffMs = 1000; // reset backoff on successful connect
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          // msg = { vessels: [...], total: N, ais_status: "CONNECTED" }
          // Normalize WS payload → MapView-compatible shape AND liveVesselsByMmsi
          const normalized = (msg.vessels || []).map((v: any) => ({
            id: v.id,
            mmsi: v.mmsi,
            name: v.name,
            vessel_type: v.vessel_type,
            imo: v.imo,
            flag: v.flag,
            destination: v.destination,
            is_oil_cargo: v.is_oil_cargo,
            latest_position: v.latest_position,
            track: v.track,
            track_points: v.track_points,
            // MapView reads v.positions[].latitude / .longitude / .speed / .course / .heading / .timestamp
            positions: (v.track || []).map((pt: any) => ({
              latitude: pt.lat,
              longitude: pt.lon,
              speed: pt.sog,
              course: pt.cog,
              heading: v.latest_position?.heading ?? pt.cog,
              timestamp: pt.timestamp,
            })),
          }));
          setVessels(normalized);
          // Propagate AIS status into systemStatus
          if (msg.ais_status) {
            setSystemStatus((prev: any) => prev ? {
              ...prev,
              providers: {
                ...prev.providers,
                ais: { ...(prev.providers?.ais || {}), status: msg.ais_status, vessels_tracked: msg.total }
              }
            } : {
              providers: { ais: { status: msg.ais_status, vessels_tracked: msg.total } }
            });
          }
        } catch (e) {
          console.error('[WS] Failed to parse message:', e);
        }
      };


      ws.onerror = (err) => {
        console.warn('[WS] WebSocket error:', err);
      };

      ws.onclose = (ev) => {
        console.log(`[WS] Connection closed (code=${ev.code}). Reconnecting in ${backoffMs}ms...`);
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (destroyed) return;
      reconnectTimer = setTimeout(() => {
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        connect();
      }, backoffMs);
    };

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null; // prevent reconnect on intentional close
        ws.close();
      }
    };
  }, [dataMode]);



  useEffect(() => {
    if (!isInvestigationMode || !selectedSpill) { setIsPlaying(false); return; }
    if (dataMode !== 'DEMO_REPLAY') {
      // In LIVE and HISTORICAL modes, investigationData is already fetched during CORRELATE
      setIsPlaying(false);
      setReplayComplete(false);
      return;
    }
    
    const run = async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/spills/${selectedSpill.id}/investigation?duration_hours=${driftDuration}`);
        if (!res.ok) {
          console.error('Investigation failed to load:', res.status);
          return;
        }
        const data = await res.json();
        
        if (!data.timeline) {
          console.error('No timeline returned');
          return;
        }

        setInvestigationData(data);
        setReplayComplete(false);
        setIsPlaying(false);

        // Compute deterministic replay bounds from the full timeline
        const times = data.timeline.map((t: any) => new Date(t.timestamp).getTime());
        const earliest = Math.min(...times);
        const latest = Math.max(...times);
        const padding = 30 * 60 * 1000;
        setStartTime(earliest - padding);
        setEndTime(latest + padding);
        setCurrentTimelineTime(earliest - padding); // always start at beginning
      } catch (err) { console.error(err); }
    };
    run();
  }, [isInvestigationMode, selectedSpill, driftDuration, dataMode]);

  // Compute visible layers based on explicit replay events
  const replayLayerStates = useMemo(() => {
    const tl = activeTimeline;
    const time = (dataMode === 'HISTORICAL_INCIDENT') ? currentTimelineTime : 
                 (investigationData && isInvestigationMode) ? currentTimelineTime : null;
    if (!time) {
      return { showSpill: true, showSatellite: true, showCorridor: true, showAttribution: true, showEnvironment: true, showAIS: true, showGrounding: false };
    }
    return getReplayLayerStates(tl, time, dataMode);
  }, [activeTimeline, currentTimelineTime, dataMode, investigationData, isInvestigationMode]);

  const handleReplayComplete = () => { setIsPlaying(false); setReplayComplete(true); };
  const handleReplayAgain = () => { setReplayComplete(false); setCurrentTimelineTime(startTime); setIsPlaying(true); };

  const incidentContext = getIncidentContext(dataMode);

  // ── liveVesselsByMmsi — authoritative LIVE vessel store ───────────────────
  // Built from WebSocket vessels[]; NEVER contains demo/historical data.
  // Used by: LiveOpsPanel (list, search, inspector), MapView (selection),
  //          vessel count in Header.
  const liveVesselsByMmsi = useMemo(() => {
    if (dataMode !== 'LIVE') return {};
    const map: Record<string, any> = {};
    for (const v of vessels) {
      const mmsi = v.mmsi || v.id?.replace('ais-', '');
      if (mmsi) {
        map[mmsi] = {
          ...v,
          mmsi,
          provenance: 'REAL_LIVE' as const,
          source: 'AISSTREAM' as const,
        };
      }
    }
    return map;
  }, [vessels, dataMode]);

  // ── SAR scan (separate from AIS tanker list) ──────────────────────────────
  const handleSarScan = async () => {
    setIsSarScanning(true);
    setSarScanResult(null);
    try {
      const res = await fetch('http://localhost:8000/api/incidents/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_mode: dataMode }),
      });
      const data = await res.json();
      setSarScanResult(data);
      // Also update orchestrator candidates so map layers still work
      const fetchedCandidates = data.candidates || [];
      setOrchestratorState((s: any) => ({ ...s, step: 'SCANNED', candidates: fetchedCandidates }));
      if (fetchedCandidates.length > 0) handleSelectCandidate(fetchedCandidates[0]);
    } catch (e) {
      console.error('[SAR SCAN]', e);
      setSarScanResult({ provenance: 'UNAVAILABLE', candidates: [] });
    } finally {
      setIsSarScanning(false);
    }
  };

  // Active satellite scene is computed from the active timeline for historical mode
  const activeScene = useMemo(() => {
    if (dataMode !== 'HISTORICAL_INCIDENT') return null;
    return getActiveSatelliteScene(
      activeTimeline as any,
      currentTimelineTime,
      incidentContext.satellite_scenes
    );
  }, [dataMode, activeTimeline, currentTimelineTime, incidentContext.satellite_scenes]);

  return (
    <div className="flex flex-col h-screen w-screen bg-marine-bg overflow-hidden text-marine-text font-sans selection:bg-marine-blue/30">
      <Header systemStatus={systemStatus} dataMode={dataMode} setDataMode={setDataMode} />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Operational Rail */}
        <LeftRail
          dataMode={dataMode}
          isInvestigationMode={isInvestigationMode}
          onSetView={setActiveView}
          activeView={activeView}
        />

        {/* Center: Dominant Map */}
        <div className="flex-1 flex flex-col relative z-0">
          <div className="flex-1 relative">
            <MapView
              driftDuration={orchestratorState.drift?.duration_hours || 5.0}
              vessels={vessels}
              selectedSpill={selectedSpill}
              candidates={orchestratorState.candidates}
              selectedCandidate={orchestratorState.selectedCandidate}
              environment={orchestratorState.environment}
              isInvestigationMode={isInvestigationMode || wakashioWorkspaceReady}
              currentTimelineTime={currentTimelineTime}
              replayLayerStates={replayLayerStates}
              incidentContext={incidentContext}
              activeScene={wakashioWorkspaceReady ? activeScene : undefined}
              dataMode={dataMode}
              selectedVessel={selectedVessel}
              selectedMmsi={selectedMmsi}
              flyToRequest={flyToRequest}
              onClearFlyTo={() => setFlyToRequest(null)}
              onOpenEvidenceViewer={() => setIsEvidenceViewerOpen(true)}
              activeView={activeView}
              onCloseLayerPanel={() => setActiveView('map')}
            />

          {/* Event Narration Overlay */}
          {showTimeMachine && activeTimeline.length > 0 && (
            <EventNarration
              timeline={activeTimeline}
              currentTimelineTime={currentTimelineTime}
            />
          )}
        </div>
        {/* Bottom Timeline Bar — always visible for HISTORICAL_INCIDENT */}
        {showTimeMachine && activeTimeline.length > 0 && (
          <BottomDashboard
            dataMode={dataMode}
            activeTimeline={activeTimeline}
            WAKASHIO_TIMELINE={WAKASHIO_TIMELINE}
            currentTimelineTime={currentTimelineTime}
            setCurrentTimelineTime={setCurrentTimelineTime}
            startTime={startTime}
            endTime={endTime}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            handleManualTimeChange={handleManualTimeChange}
            handleNodeSelect={handleNodeSelect}
            investigationData={investigationData}
            orchestratorState={orchestratorState}
            activeScene={activeScene}
            handleReplayComplete={handleReplayComplete}
          />
        )}
      </div>

        {/* Right Intelligence Panel (Collapsible) */}
        <div
          className={'border-l border-[#101C26] bg-[#0a131c] shadow-2xl relative z-10 flex flex-col transition-all duration-300 ' +
            (rightPanelCollapsed ? 'w-[32px] min-w-[32px]' : 'w-[400px] min-w-[400px]')}
        >
          {/* Collapse Toggle */}
          <button
            onClick={() => setRightPanelCollapsed(c => !c)}
            className="absolute top-4 -left-3 z-30 w-6 h-6 rounded-full bg-[#071018] border border-[#101C26] text-marine-muted hover:text-white hover:border-marine-muted flex items-center justify-center shadow-lg transition-all"
            title={rightPanelCollapsed ? 'Expand Intelligence Panel' : 'Collapse Intelligence Panel'}
          >
            {rightPanelCollapsed ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>

          {!rightPanelCollapsed ? (
            dataMode === 'LIVE' ? (
              // ── LIVE: dedicated Live Ops Panel ─────────────────────────────
              <LiveOpsPanel
                liveVesselsByMmsi={liveVesselsByMmsi}
                selectedMmsi={selectedMmsi}
                aisStatus={systemStatus?.providers?.ais?.status ?? 'UNAVAILABLE'}
                onSelectVessel={onSelectVessel}
                sarStatus={
                  isSarScanning ? 'SCANNING' :
                  sarScanResult?.provenance === 'REAL' || sarScanResult?.provenance === 'REAL_LIVE' ? 'REAL_LIVE' :
                  'UNAVAILABLE'
                }
                onExecuteSarScan={handleSarScan}
                sarScanResult={sarScanResult}
                isSarScanning={isSarScanning}
              />
            ) : (
              // ── Non-LIVE: existing Intelligence Panel ───────────────────────
              <IntelligencePanel
                dataMode={dataMode}
                selectedVessel={selectedVessel}
                orchestratorState={orchestratorState}
                handleScan={handleScan}
                handleInvestigate={handleInvestigate}
                handleCorrelate={handleCorrelate}
                handleViewEvidence={handleViewEvidence}
                handleSelectCandidate={handleSelectCandidate}
                setIsInvestigationMode={setIsInvestigationMode}

                isInvestigationMode={isInvestigationMode}
                investigationData={investigationData}
                selectedEvidenceNode={selectedEvidenceNode}
                handleNodeSelect={handleNodeSelect}
                setSelectedEvidenceNode={setSelectedEvidenceNode}
                replayLayerStates={replayLayerStates}

                activeScene={activeScene ?? null}
                incidentContext={incidentContext}
                currentTimelineTime={currentTimelineTime}
                handleManualTimeChange={handleManualTimeChange}
              />
            )
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <span
                className="text-[9px] font-bold tracking-widest uppercase text-marine-tertiary"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                {dataMode === 'LIVE' ? 'Live Operations' : 'Intelligence Panel'}
              </span>
            </div>
          )}
        </div>
        {/* Controlled Overlay Evidence Viewer */}
        {isEvidenceViewerOpen && activeScene && (
          <ZoomableEvidenceViewer 
            scene={activeScene} 
            onClose={() => setIsEvidenceViewerOpen(false)} 
          />
        )}
      </div>

      {/* Investigation Complete overlay (Phase 7 compatibility) */}
      {isInvestigationMode && replayComplete && investigationData && dataMode !== 'HISTORICAL_INCIDENT' && (
        <InvestigationComplete
          investigation={investigationData}
          onReplay={handleReplayAgain}
          onViewEvidence={() => {
            setReplayComplete(false);
            setCurrentTimelineTime(endTime);
          }}
        />
      )}
    </div>
  );
}

export default App;
