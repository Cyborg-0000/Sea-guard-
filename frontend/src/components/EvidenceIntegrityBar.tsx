import { ShieldCheck } from 'lucide-react';

const EvidenceIntegrityBar = ({ dataMode, state }: { dataMode: string, state: any }) => {
  // Determine dynamic provenance based on state
  
  // SATELLITE
  let satStatus = '○ PENDING';
  let satColor = 'text-marine-muted';
  if (state.step !== 'IDLE') {
    if (dataMode === 'LIVE') {
      satStatus = '● REAL';
      satColor = 'text-marine-green';
    } else if (dataMode === 'HISTORICAL_INCIDENT') {
      satStatus = '● MULTIPLE (REAL / SIMULATED_HISTORICAL)';
      satColor = 'text-marine-amber';
    } else {
      satStatus = '● SIMULATED_HISTORICAL';
      satColor = 'text-marine-purple';
    }
  }

  // ENVIRONMENT
  let envStatus = '○ PENDING';
  let envColor = 'text-marine-muted';
  if (['INVESTIGATED', 'CORRELATING', 'VERDICT'].includes(state.step)) {
    if (dataMode === 'DEMO_REPLAY') {
      envStatus = '● OFFLINE_FIXTURE';
      envColor = 'text-marine-amber';
    } else if (dataMode === 'HISTORICAL_INCIDENT') {
      envStatus = '● SIMULATED_HISTORICAL (Approximation)';
      envColor = 'text-marine-purple';
    } else {
      envStatus = '● REAL';
      envColor = 'text-marine-green';
    }
  }

  // DRIFT
  let driftStatus = '○ PENDING';
  let driftColor = 'text-marine-muted';
  if (['INVESTIGATED', 'CORRELATING', 'VERDICT'].includes(state.step)) {
    driftStatus = '● COMPUTED';
    driftColor = 'text-marine-blue';
  }

  // AIS
  let aisStatus = '○ PENDING';
  let aisColor = 'text-marine-muted';
  if (state.step === 'VERDICT' || state.step === 'CORRELATING') {
    if (dataMode === 'LIVE') {
      aisStatus = '● REAL';
      aisColor = 'text-marine-green';
    } else if (dataMode === 'HISTORICAL_INCIDENT') {
      aisStatus = '● SIMULATED_HISTORICAL (Stand-in)';
      aisColor = 'text-marine-purple';
    } else {
      aisStatus = '● OFFLINE_FIXTURE';
      aisColor = 'text-marine-amber';
    }
  }

  return (
    <div className="flex items-center gap-6 px-6 py-2 bg-marine-panel border-y border-marine-border shrink-0 font-mono">
      <div className="flex items-center gap-2 border-r border-marine-border pr-6">
        <ShieldCheck className="w-4 h-4 text-marine-blue" />
        <span className="text-[10px] font-bold tracking-widest text-marine-text uppercase">Evidence Integrity</span>
      </div>
      
      <div className="flex flex-1 items-center gap-8 text-[10px] tracking-wider">
        <div className="flex items-center gap-2">
          <span className="text-marine-tertiary">SAR</span>
          <span className={satColor}>{satStatus}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-marine-tertiary">ENVIRONMENT</span>
          <span className={envColor}>{envStatus}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-marine-tertiary">DRIFT CORRIDOR</span>
          <span className={driftColor}>{driftStatus}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-marine-tertiary">AIS TRAJECTORY</span>
          <span className={aisColor}>{aisStatus}</span>
        </div>
      </div>
    </div>
  );
};

export default EvidenceIntegrityBar;
