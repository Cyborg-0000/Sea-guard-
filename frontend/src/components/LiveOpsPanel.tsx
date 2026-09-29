/**
 * LiveOpsPanel — LIVE OPERATIONS right-panel
 *
 * Data flows:
 *   liveVesselsByMmsi  — authoritative Map<MMSI, vessel> built from WebSocket in App.tsx
 *   onSelectVessel     — user-initiated selection only (fires camera flyTo + inspector)
 *   AIS updates        — populate liveVesselsByMmsi without touching selectedMmsi / camera
 *
 * Layout (from spec):
 *   ┌ LIVE OPERATIONS header ──────────────────┐
 *   │ ● AIS LIVE  5 TANKERS                    │
 *   ├ Search tanker... ────────────────────────┤
 *   ├ TRACKED TANKERS ─────────────────────────┤
 *   │  IONIAN SEA       12.6 kt               │
 *   │  MARAN THULE       8.6 kt               │
 *   │  ...                                     │
 *   ├ SELECTED VESSEL ─────────────────────────┤
 *   │  IONIAN SEA / MMSI / TANKER / SOG / DEST │
 *   │  OBSERVED TRACK: 18 pts · 42 min         │
 *   ├ SAR REGIONAL SCAN ───────────────────────┤
 *   │  Find SAR anomalies  [EXECUTE SAR SCAN]  │
 *   └──────────────────────────────────────────┘
 */

import { useState, useMemo, useCallback } from 'react';
import {
  Radio, Search, X, Navigation, Clock, AlertTriangle,
  ScanLine, Activity, ChevronRight, Anchor
} from 'lucide-react';

export interface LiveVessel {
  mmsi: string;
  id: string;
  name: string;
  vessel_type: string;
  imo: string | null;
  flag: string;
  destination?: string;
  // latest position (required for display)
  latest_position?: {
    lat: number;
    lon: number;
    speed_kts: number;
    course: number;
    heading: number | null;
    timestamp: string;
  };
  track?: Array<{ lat: number; lon: number; sog: number; cog: number; timestamp: string }>;
  track_points?: number;
  provenance: 'REAL_LIVE';
  source: 'AISSTREAM';
}

interface LiveOpsPanelProps {
  liveVesselsByMmsi: Record<string, LiveVessel>;
  selectedMmsi: string | null;
  aisStatus: string;             // 'CONNECTED' | 'REAL_LIVE' | 'UNAVAILABLE' | 'DEGRADED'
  onSelectVessel: (mmsi: string, lat: number, lon: number) => void;
  // SAR scan passthrough (separate from AIS)
  sarStatus?: string;            // 'UNAVAILABLE' | 'SCANNING' | 'REAL_LIVE'
  onExecuteSarScan?: () => void;
  sarScanResult?: {
    satellite_product?: string;
    acquisition_time?: string;
    candidates?: any[];
    provenance?: string;
  } | null;
  isSarScanning?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatSpeed(sog: number | undefined | null): string {
  if (sog == null) return '—';
  if (sog < 0.3) return 'MOORED';
  return `${sog.toFixed(1)} kt`;
}

function trackAge(track: LiveVessel['track'], fallbackTs?: string): string | null {
  if (!track || track.length === 0) return null;
  const lastPt = track[track.length - 1];
  const ts = lastPt?.timestamp || fallbackTs;
  if (!ts) return null;
  const ageMs = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(ageMs / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} hr ${mins % 60} min`;
}

// ── Provenance Badge ───────────────────────────────────────────────────────────

const ProvBadge = ({ label }: { label: string }) => (
  <span className="ml-1.5 px-1.5 py-0.5 rounded text-[8px] font-bold tracking-widest uppercase border border-[#00e5ff]/30 bg-[#00e5ff]/10 text-[#00e5ff]">
    {label}
  </span>
);

// ── Vessel Row ─────────────────────────────────────────────────────────────────

const VesselRow = ({
  vessel,
  isSelected,
  onSelect,
}: {
  vessel: LiveVessel;
  isSelected: boolean;
  onSelect: () => void;
}) => {
  const pos = vessel.latest_position;
  const sog = pos?.speed_kts;
  const speedLabel = formatSpeed(sog);
  const isMoving = sog != null && sog >= 0.3;

  return (
    <button
      className={`w-full text-left px-3 py-2.5 border-b border-marine-border/40 transition-all flex items-center gap-3 group ${
        isSelected
          ? 'bg-[#00e5ff]/10 border-l-2 border-l-[#00e5ff]'
          : 'hover:bg-white/[0.03] border-l-2 border-l-transparent'
      }`}
      onClick={onSelect}
    >
      {/* Direction indicator */}
      <div
        className={`shrink-0 transition-colors ${isSelected ? 'text-[#00e5ff]' : 'text-marine-muted group-hover:text-marine-text'}`}
        style={{
          transform: pos?.heading != null ? `rotate(${pos.heading}deg)` : pos?.course != null ? `rotate(${pos.course}deg)` : undefined
        }}
      >
        {isMoving ? (
          <Navigation className="w-3.5 h-3.5" />
        ) : (
          <Anchor className="w-3.5 h-3.5" />
        )}
      </div>

      {/* Name + Type */}
      <div className="flex-1 min-w-0">
        <div className={`text-[11px] font-bold tracking-widest uppercase truncate leading-tight ${
          isSelected ? 'text-[#00e5ff]' : 'text-marine-text group-hover:text-white'
        }`}>
          {vessel.name !== 'UNKNOWN' ? vessel.name : `MMSI ${vessel.mmsi}`}
        </div>
        <div className="text-[9px] text-marine-muted font-mono uppercase tracking-wider truncate">
          {vessel.vessel_type && vessel.vessel_type !== 'UNCLASSIFIED' ? vessel.vessel_type : 'TANKER'}
        </div>
      </div>

      {/* Speed */}
      <div className={`shrink-0 text-[11px] font-mono font-bold text-right ${
        sog != null && sog < 0.3 ? 'text-marine-amber' : isSelected ? 'text-[#00e5ff]' : 'text-marine-text'
      }`}>
        {speedLabel}
      </div>

      <ChevronRight className={`shrink-0 w-3 h-3 ${isSelected ? 'text-[#00e5ff]' : 'text-marine-muted group-hover:text-marine-text'}`} />
    </button>
  );
};

// ── Selected Vessel Inspector ──────────────────────────────────────────────────

const VesselInspector = ({ vessel }: { vessel: LiveVessel }) => {
  const pos = vessel.latest_position;
  const track = vessel.track || [];
  const ptCount = vessel.track_points ?? track.length;
  const age = trackAge(track, pos?.timestamp);

  return (
    <div className="px-4 py-3 border-b border-marine-border/40 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[9px] font-bold tracking-widest uppercase text-marine-tertiary">Selected Vessel</span>
        <ProvBadge label="REAL LIVE AIS" />
      </div>

      {/* Identity */}
      <div>
        <div className="text-[14px] font-bold tracking-widest text-[#00e5ff] uppercase leading-tight">
          {vessel.name !== 'UNKNOWN' ? vessel.name : `MMSI ${vessel.mmsi}`}
        </div>
        <div className="text-[10px] text-marine-muted font-mono mt-0.5 uppercase tracking-wider">
          {vessel.vessel_type && vessel.vessel_type !== 'UNCLASSIFIED' ? vessel.vessel_type : 'TANKER'}
        </div>
      </div>

      {/* MMSI / IMO */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono">
        <div>
          <div className="text-marine-tertiary uppercase tracking-wider">MMSI</div>
          <div className="text-marine-text font-bold">{vessel.mmsi}</div>
        </div>
        {vessel.imo && (
          <div>
            <div className="text-marine-tertiary uppercase tracking-wider">IMO</div>
            <div className="text-marine-text font-bold">{vessel.imo}</div>
          </div>
        )}
        {pos && (
          <>
            <div>
              <div className="text-marine-tertiary uppercase tracking-wider">LAT</div>
              <div className="text-marine-text font-bold">{pos.lat.toFixed(4)}°</div>
            </div>
            <div>
              <div className="text-marine-tertiary uppercase tracking-wider">LON</div>
              <div className="text-marine-text font-bold">{pos.lon.toFixed(4)}°</div>
            </div>
            <div>
              <div className="text-marine-tertiary uppercase tracking-wider">SOG</div>
              <div className="text-marine-text font-bold">{formatSpeed(pos.speed_kts)}</div>
            </div>
            <div>
              <div className="text-marine-tertiary uppercase tracking-wider">COG</div>
              <div className="text-marine-text font-bold">{pos.course != null ? `${pos.course.toFixed(0)}°` : '—'}</div>
            </div>
          </>
        )}
        {vessel.destination && vessel.destination !== 'NOT AVAILABLE' && (
          <div className="col-span-2">
            <div className="text-marine-tertiary uppercase tracking-wider">DESTINATION</div>
            <div className="text-[#00e5ff] font-bold uppercase">→ {vessel.destination}</div>
          </div>
        )}
      </div>

      {/* Observed Track */}
      <div className="pt-2 border-t border-marine-border/30">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-3 h-3 text-marine-tertiary" />
          <span className="text-[9px] text-marine-tertiary uppercase tracking-wider font-bold">Observed Track</span>
        </div>
        {ptCount > 0 ? (
          <div className="text-[10px] font-mono text-marine-text">
            <span className="text-[#00e5ff] font-bold">{ptCount}</span>
            <span className="text-marine-muted"> pts</span>
            {age && (
              <>
                <span className="text-marine-muted mx-1">·</span>
                <span className="text-marine-muted">{age}</span>
              </>
            )}
            <ProvBadge label="REAL AIS" />
          </div>
        ) : (
          <div className="text-[10px] text-marine-muted font-mono">Awaiting track data…</div>
        )}
      </div>
    </div>
  );
};

// ── Main Panel ─────────────────────────────────────────────────────────────────

const LiveOpsPanel = ({
  liveVesselsByMmsi,
  selectedMmsi,
  aisStatus,
  onSelectVessel,
  sarStatus = 'UNAVAILABLE',
  onExecuteSarScan,
  sarScanResult,
  isSarScanning = false,
}: LiveOpsPanelProps) => {
  const [searchQuery, setSearchQuery] = useState('');

  const vessels = useMemo(() => Object.values(liveVesselsByMmsi), [liveVesselsByMmsi]);
  const tankerCount = vessels.length;

  // ── Client-side search (name, MMSI, IMO, destination) ─────────────────────
  // Never falls back to demo/historical data — only liveVesselsByMmsi.
  const searchResults: LiveVessel[] = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    if (!q) return [];
    return vessels.filter(v =>
      v.name.toUpperCase().includes(q) ||
      v.mmsi.includes(q) ||
      (v.imo && v.imo.includes(q)) ||
      (v.destination && v.destination.toUpperCase().includes(q))
    );
  }, [searchQuery, vessels]);

  const selectedVessel = selectedMmsi ? liveVesselsByMmsi[selectedMmsi] : null;

  const handleSelect = useCallback((v: LiveVessel) => {
    const lat = v.latest_position?.lat ?? 0;
    const lon = v.latest_position?.lon ?? 0;
    onSelectVessel(v.mmsi, lat, lon);
    // Clear search after selection so list is visible
    setSearchQuery('');
  }, [onSelectVessel]);

  // AIS status display
  const isConnected = aisStatus === 'CONNECTED' || aisStatus === 'REAL_LIVE';
  const aisDisplayLabel = isConnected ? 'REAL LIVE' : aisStatus;
  const aisColor = isConnected ? '#00e5ff' : aisStatus === 'DEGRADED' ? '#F59E0B' : '#EF4444';

  // SAR status
  const sarLabel = sarStatus === 'UNAVAILABLE' ? 'NO LIVE SAR FEED' :
                   sarStatus === 'SCANNING' ? 'SCANNING…' :
                   sarStatus === 'REAL_LIVE' ? 'REAL LIVE' : sarStatus;
  const sarColor = sarStatus === 'REAL_LIVE' ? '#00e5ff' :
                   sarStatus === 'SCANNING'  ? '#F59E0B' : '#6F8292';

  return (
    <div className="h-full flex flex-col bg-marine-panel border-l border-marine-border text-marine-text overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 border-b border-marine-border/60 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-marine-tertiary">
            Live Operations
          </span>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: aisColor }} />
            <span className="text-[10px] font-bold tracking-widest uppercase"
              style={{ color: aisColor }}>
              AIS {aisDisplayLabel}
            </span>
          </div>
        </div>

        {/* Tanker count */}
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4" style={{ color: aisColor }} />
          <span className="text-[11px] font-mono">
            {tankerCount > 0 ? (
              <>
                <span className="font-bold text-white">{tankerCount}</span>
                <span className="text-marine-muted"> TANKER{tankerCount !== 1 ? 'S' : ''} TRACKED</span>
              </>
            ) : isConnected ? (
              <span className="text-marine-muted">AWAITING VESSEL DATA…</span>
            ) : aisStatus === 'UNAVAILABLE' ? (
              <span className="text-marine-muted animate-pulse">CONNECTING TO LIVE AIS...</span>
            ) : (
              <span className="text-marine-red">AIS {aisStatus}</span>
            )}
          </span>
        </div>
      </div>

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      <div className="px-3 py-2.5 border-b border-marine-border/40 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-marine-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search live tanker…"
            className="w-full bg-[#0a131c] border border-marine-border/60 rounded text-[11px] text-marine-text placeholder-marine-muted/60 pl-8 pr-8 py-2 font-mono focus:outline-none focus:border-[#00e5ff]/40 transition-colors tracking-wider uppercase"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-marine-muted hover:text-marine-text"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Search results */}
        {searchQuery.trim() !== '' && (
          <div className="mt-2">
            {searchResults.length === 0 ? (
              <div className="text-[10px] text-marine-red font-mono uppercase tracking-wider px-1 py-1 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                NO LIVE TANKER MATCH
                <span className="text-marine-muted text-[9px] normal-case ml-1">(real AIS only)</span>
              </div>
            ) : (
              <div className="space-y-0.5">
                {searchResults.map(v => (
                  <button
                    key={v.mmsi}
                    onClick={() => handleSelect(v)}
                    className="w-full text-left px-2 py-1.5 rounded bg-[#00e5ff]/5 hover:bg-[#00e5ff]/10 border border-[#00e5ff]/20 transition-all flex items-center gap-2"
                  >
                    <Navigation className="w-3 h-3 text-[#00e5ff] shrink-0" />
                    <span className="text-[11px] font-bold text-[#00e5ff] uppercase tracking-widest truncate">{v.name}</span>
                    <span className="ml-auto text-[9px] text-marine-muted font-mono">{formatSpeed(v.latest_position?.speed_kts)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tracked Tankers List ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-3 py-2 border-b border-marine-border/30 flex items-center gap-2 sticky top-0 bg-marine-panel/95 backdrop-blur-sm z-10">
          <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-marine-tertiary">
            Tracked Tankers
          </span>
          {tankerCount > 0 && (
            <span className="text-[9px] font-bold text-marine-muted font-mono">· {tankerCount}</span>
          )}
        </div>

        {vessels.length === 0 ? (
          <div className="px-4 py-6 text-center">
            {isConnected ? (
              <div className="space-y-1">
                <Activity className="w-6 h-6 text-marine-muted mx-auto animate-pulse" />
                <div className="text-[10px] text-marine-muted font-mono uppercase tracking-wider">Waiting for AIS data…</div>
                <div className="text-[9px] text-marine-muted/60 font-mono">Registry will populate on next broadcast</div>
              </div>
            ) : (
              <div className="space-y-1">
                <Radio className="w-6 h-6 text-marine-red mx-auto" />
                <div className="text-[10px] text-marine-red font-mono uppercase tracking-wider">AIS {aisStatus}</div>
              </div>
            )}
          </div>
        ) : (
          <div>
            {vessels.map(v => (
              <VesselRow
                key={v.mmsi}
                vessel={v}
                isSelected={v.mmsi === selectedMmsi}
                onSelect={() => handleSelect(v)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Selected Vessel Inspector ────────────────────────────────────────── */}
      {selectedVessel && (
        <div className="shrink-0 border-t border-marine-border/60">
          <VesselInspector vessel={selectedVessel} />
        </div>
      )}

      {/* ── SAR Regional Scan ────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-marine-border/60 px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-marine-tertiary">
            SAR Regional Scan
          </span>
          <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: sarColor }}>
            {sarLabel}
          </span>
        </div>
        <div className="text-[9px] text-marine-muted font-mono">
          Search satellite data for SAR anomalies / oil-spill candidates
        </div>
        <button
          onClick={onExecuteSarScan}
          disabled={isSarScanning}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded border text-[10px] font-bold tracking-widest uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed
            border-marine-border text-marine-text hover:bg-white/5 hover:border-marine-blue/50 hover:text-marine-blue"
        >
          <ScanLine className={`w-4 h-4 ${isSarScanning ? 'animate-spin' : ''}`} />
          {isSarScanning ? 'Scanning…' : 'Execute SAR Scan'}
        </button>

        {/* SAR result — shown below the button when available */}
        {sarScanResult && !isSarScanning && (
          <div className="mt-1 p-2.5 rounded bg-[#0a131c] border border-marine-border/40 space-y-1.5">
            <div className="text-[9px] font-bold text-marine-muted uppercase tracking-wider flex items-center gap-1.5">
              <ScanLine className="w-3 h-3" />
              SAR Scan Result
              <span className={`ml-auto px-1.5 py-0.5 rounded text-[8px] border font-bold ${
                sarScanResult.provenance === 'REAL' || sarScanResult.provenance === 'REAL_LIVE'
                  ? 'border-[#00e5ff]/30 text-[#00e5ff] bg-[#00e5ff]/10'
                  : sarScanResult.provenance?.startsWith('SIMULATED')
                  ? 'border-marine-purple/30 text-marine-purple bg-marine-purple/10'
                  : 'border-marine-amber/30 text-marine-amber bg-marine-amber/10'
              }`}>
                {sarScanResult.provenance ?? 'UNKNOWN'}
              </span>
            </div>
            <div className="text-[10px] font-mono">
              <span className="text-marine-muted">Candidates: </span>
              <span className="text-white font-bold">{sarScanResult.candidates?.length ?? 0}</span>
            </div>
            {sarScanResult.candidates && sarScanResult.candidates.length > 0 && (
              <div className="space-y-1">
                {sarScanResult.candidates.slice(0, 3).map((c: any, i: number) => (
                  <div key={i} className="text-[9px] font-mono text-marine-text px-2 py-1 bg-[#06101a] rounded border border-marine-border/20">
                    <span className="text-marine-amber font-bold">ANOMALY {i + 1}</span>
                    <span className="text-marine-muted ml-2">
                      {c.centroid_lat?.toFixed(3)}°N, {c.centroid_lon?.toFixed(3)}°E
                    </span>
                    <span className="text-marine-muted ml-2">{c.area_km2?.toFixed(1)} km²</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveOpsPanel;
