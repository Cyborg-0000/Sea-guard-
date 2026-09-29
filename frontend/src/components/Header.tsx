import { Shield, Activity, Radio, CheckCircle, AlertTriangle, Disc, Satellite } from 'lucide-react';

const STATUS_COLOR: Record<string, string> = {
  CONNECTED:   'text-marine-green',
  REAL_LIVE:   'text-marine-green',
  FRESH:       'text-marine-green',
  DEGRADED:    'text-marine-amber',
  STALE:       'text-marine-amber',
  UNAVAILABLE: 'text-marine-red',
  OFFLINE:     'text-marine-red',
  // Provenance badges — clearly distinct
  SIMULATED:   'text-marine-purple',
  SIMULATED_HISTORICAL: 'text-marine-purple',
  SIMULATED_DEMO:       'text-marine-purple',
};



const Header = ({
  systemStatus,
  dataMode: dataModeOverride,
  setDataMode,
}: {
  systemStatus?: any;
  dataMode?: string;
  setDataMode?: (mode: string) => void;
}) => {
  const rawMode = dataModeOverride || systemStatus?.data_mode || 'LIVE';

  const switchMode = (next: string) => {
    if (!setDataMode) return;
    if (next === rawMode) return; // already active — no-op
    console.log(`[MODE CHANGE] ${rawMode} → ${next}`);
    setDataMode(next);
  };

  // ── Provider status resolution ─────────────────────────────────────────────
  // Default to UNAVAILABLE (not SIMULATED) when provider data is absent.
  // SIMULATED is only used when the data object explicitly carries that provenance.
  const aisInfo  = systemStatus?.providers?.ais        || { status: 'UNAVAILABLE' };
  const satInfo  = systemStatus?.providers?.satellite  || { status: 'UNAVAILABLE' };
  const envInfo  = systemStatus?.providers?.environment|| { status: 'UNAVAILABLE' };

  // Derive display status:
  //   LIVE mode + CONNECTED AIS  → show as REAL LIVE
  //   Other modes keep raw status string
  const rawAisStatus = aisInfo.status  || 'UNAVAILABLE';
  const rawSatStatus = satInfo.status  || 'UNAVAILABLE';
  const rawEnvStatus = envInfo.status  || 'UNAVAILABLE';

  const aisStatus = (rawMode === 'LIVE' && rawAisStatus === 'CONNECTED') ? 'REAL_LIVE' : rawAisStatus;
  const satStatus = rawSatStatus;   // SAR: UNAVAILABLE in LIVE unless real pipeline running
  const envStatus = (rawMode === 'LIVE' && (rawEnvStatus === 'CONNECTED' || rawEnvStatus === 'FRESH')) ? 'REAL_LIVE' : rawEnvStatus;

  // Display labels (shorter for header pill)
  const aisLabel = aisStatus === 'REAL_LIVE' ? 'REAL LIVE' : aisStatus;
  const satLabel = satStatus === 'UNAVAILABLE' ? 'UNAVAILABLE' : satStatus;
  const envLabel = envStatus === 'REAL_LIVE' ? 'REAL LIVE' : envStatus;

  // Overall system status
  const statuses = [aisStatus, satStatus, envStatus];
  let overallStatus = 'OPERATIONAL';
  let overallColor  = 'text-marine-green';
  let StatusIcon    = CheckCircle;

  if (statuses.some(s => s === 'OFFLINE' || s === 'UNAVAILABLE')) {
    // In LIVE, UNAVAILABLE SAR/ENV is acceptable — only flag if AIS itself is unavailable
    if (rawMode === 'LIVE' && (rawAisStatus === 'UNAVAILABLE' || rawAisStatus === 'OFFLINE')) {
      overallStatus = 'AIS OFFLINE';
      overallColor  = 'text-marine-red';
      StatusIcon    = AlertTriangle;
    } else if (rawMode !== 'LIVE') {
      overallStatus = 'DEGRADED';
      overallColor  = 'text-marine-amber';
      StatusIcon    = AlertTriangle;
    }
    // In LIVE with AIS connected, UNAVAILABLE SAR/ENV is normal — show OPERATIONAL
  }
  if (statuses.includes('DEGRADED') || statuses.includes('STALE')) {
    overallStatus = 'DEGRADED';
    overallColor  = 'text-marine-amber';
    StatusIcon    = AlertTriangle;
  }
  if (aisStatus === 'REAL_LIVE') {
    overallStatus = 'OPERATIONAL';
    overallColor  = 'text-marine-green';
    StatusIcon    = CheckCircle;
  }

  const now = new Date();
  const timeString = now.toISOString().substring(11, 19) + ' UTC';

  return (
    <header className="h-14 bg-marine-panel border-b border-marine-border flex items-center justify-between px-6 shrink-0 w-full z-50 shadow-md">
      {/* Brand */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <Shield className="text-marine-blue h-6 w-6" />
          <div className="flex flex-col">
            <h1 className="font-bold tracking-widest text-sm text-marine-text leading-tight">MARINEGUARD</h1>
            <span className="text-[9px] text-marine-muted tracking-[0.2em] font-mono leading-tight uppercase">Maritime Incident Intelligence</span>
          </div>
        </div>
        <div className="h-8 w-px bg-marine-border mx-2"></div>
      </div>

      {/* Center: Mode Selectors */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => switchMode('LIVE')}
          className={`flex items-center gap-2 px-4 py-2 rounded border transition-all ${
            rawMode === 'LIVE'
              ? 'bg-[#00e5ff]/10 border-[#00e5ff] text-[#00e5ff]'
              : 'bg-transparent border-transparent text-marine-muted hover:text-marine-text hover:bg-white/5'
          }`}
        >
          <Activity className="w-4 h-4" />
          <div className="flex flex-col items-start text-left">
            <span className="text-[10px] font-bold tracking-widest uppercase leading-tight">LIVE OPERATIONS</span>
            <span className="text-[8px] opacity-70 font-mono tracking-wider leading-tight">Real-time Monitoring</span>
          </div>
        </button>

        <button
          onClick={() => switchMode('DEMO_REPLAY')}
          className={`flex items-center gap-2 px-4 py-2 rounded border transition-all ${
            rawMode === 'DEMO_REPLAY'
              ? 'bg-marine-blue/10 border-marine-blue text-marine-blue'
              : 'bg-transparent border-transparent text-marine-muted hover:text-marine-text hover:bg-white/5'
          }`}
        >
          <Disc className="w-4 h-4" />
          <div className="flex flex-col items-start text-left">
            <span className="text-[10px] font-bold tracking-widest uppercase leading-tight">DEMO REPLAY</span>
            <span className="text-[8px] opacity-70 font-mono tracking-wider leading-tight">Simulated Scenario</span>
          </div>
        </button>

        <button
          onClick={() => switchMode('HISTORICAL_INCIDENT')}
          className={`flex items-center gap-2 px-4 py-2 rounded border transition-all ${
            rawMode === 'HISTORICAL_INCIDENT'
              ? 'bg-marine-purple/10 border-marine-purple text-marine-purple'
              : 'bg-transparent border-transparent text-marine-muted hover:text-marine-text hover:bg-white/5'
          }`}
        >
          <Shield className="w-4 h-4" />
          <div className="flex flex-col items-start text-left">
            <span className="text-[10px] font-bold tracking-widest uppercase leading-tight">WAKASHIO RECONSTRUCTION</span>
            <span className="text-[8px] opacity-70 font-mono tracking-wider leading-tight">Historical Investigation</span>
          </div>
        </button>
      </div>

      {/* Provider Statuses */}
      <div className="flex items-center gap-8 text-[11px] font-bold tracking-wider uppercase">
        {/* SAR */}
        <div className="flex items-center gap-2">
          <Satellite className={`${STATUS_COLOR[satStatus] || 'text-marine-muted'} h-4 w-4`} />
          <span className="text-marine-tertiary">SAR</span>
          <span className={STATUS_COLOR[satStatus] || 'text-marine-muted'}>● {satLabel}</span>
        </div>

        {/* ENV */}
        <div className="flex items-center gap-2">
          <Activity className={`${STATUS_COLOR[envStatus] || 'text-marine-muted'} h-4 w-4`} />
          <span className="text-marine-tertiary">ENV</span>
          <span className={STATUS_COLOR[envStatus] || 'text-marine-muted'}>● {envLabel}</span>
        </div>

        {/* AIS */}
        <div className="flex items-center gap-2">
          <Radio className={`${STATUS_COLOR[aisStatus] || 'text-marine-muted'} h-4 w-4`} />
          <div className="flex flex-col items-start leading-[1.1]">
            <div className="flex items-center gap-1.5">
              <span className="text-marine-tertiary">AIS</span>
              <span className={STATUS_COLOR[aisStatus] || 'text-marine-muted'}>● {aisLabel}</span>
            </div>
            {rawMode === 'LIVE' && (
              <div className="flex flex-col pl-[26px] mt-1 gap-0.5">
                <span className="text-[9px] text-marine-muted font-mono uppercase">
                  OIL TANKERS:{' '}
                  <span className="text-white font-bold">{aisInfo.vessels_tracked ?? 0}</span>
                </span>
                {aisInfo.vessels_tracked === 0 ? (
                  <span className="text-[8px] text-marine-red/80 font-mono">NO OIL-CARGO VESSELS OBSERVED</span>
                ) : aisInfo.last_update ? (
                  <span className="text-[8px] text-marine-muted/80 font-mono uppercase">
                    LAST UPDATE: {new Date(aisInfo.last_update).toLocaleTimeString('en-GB', { timeZone: 'UTC' })} UTC
                  </span>
                ) : null}
              </div>
            )}
            {rawMode !== 'LIVE' && aisInfo.vessels_tracked !== undefined && (
              <span className="text-[9px] text-marine-muted font-mono pl-[26px] normal-case mt-1">
                {aisInfo.vessels_tracked} observations
              </span>
            )}
          </div>
        </div>

        <div className="h-8 w-px bg-marine-border mx-2"></div>

        {/* Date / Time */}
        <div className="flex flex-col items-end leading-tight mr-4">
          <span className="text-[11px] text-marine-text tracking-widest font-mono">{timeString}</span>
          <span className="text-[9px] text-marine-muted tracking-widest font-mono uppercase">
            {now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>

        {/* Overall */}
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[9px] text-marine-tertiary tracking-widest">AIS STATUS</span>
          <div className={`flex items-center gap-1.5 ${overallColor} font-bold text-xs`}>
            <span>{overallStatus}</span>
            <StatusIcon className="h-3 w-3" />
          </div>
        </div>

        {/* Menu Icon */}
        <div className="ml-4 pl-4 border-l border-marine-border flex items-center">
          <div className="space-y-1.5 cursor-pointer hover:opacity-80">
            <div className="w-5 h-px bg-white"></div>
            <div className="w-5 h-px bg-white"></div>
            <div className="w-5 h-px bg-white"></div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
