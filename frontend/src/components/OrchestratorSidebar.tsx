import { Search, Navigation2, Crosshair, AlertTriangle, ShieldCheck, CheckCircle2, Play } from 'lucide-react';

interface OrchestratorSidebarProps {
  dataMode: string;
  state: any;
  onScan: () => void;
  onInvestigate: () => void;
  onCorrelate: () => void;
  onSelectCandidate: (candidate: any) => void;
  onViewEvidence: () => void;
  onOpenReplay?: () => void;
}

const OrchestratorSidebar = ({ dataMode, state, onScan, onInvestigate, onCorrelate, onSelectCandidate, onViewEvidence, onOpenReplay }: OrchestratorSidebarProps) => {
  return (
    <div className="w-full h-full bg-[#0a131c] flex flex-col shrink-0 overflow-hidden">


      {/* WORKFLOW STEPS */}
      <div className="p-5 flex flex-col gap-6 flex-1 overflow-y-auto pb-10">
        
        {/* STEP 1: SCAN */}
        <div className={`flex flex-col gap-3 ${state.step === 'IDLE' || state.step === 'SCANNING' ? 'opacity-100' : 'opacity-70'}`}>
          <div className="flex items-center justify-between border-b border-marine-border pb-2">
            <div className="flex items-center gap-2 text-marine-text">
              <Search className="w-4 h-4 text-marine-muted" />
              <h3 className="text-[10px] font-bold tracking-widest uppercase text-marine-tertiary">01 SCAN</h3>
            </div>
            {state.step === 'SCANNING' && <span className="text-[9px] text-marine-amber animate-pulse font-mono uppercase tracking-wider">
              {dataMode === 'HISTORICAL_INCIDENT' ? 'Loading fixtures...' : 'Connecting to CDSE...'}
            </span>}
            {['SCANNED', 'INVESTIGATING', 'INVESTIGATED', 'CORRELATING', 'VERDICT'].includes(state.step) && <CheckCircle2 className="w-3.5 h-3.5 text-marine-green" />}
          </div>
          
          {state.step === 'IDLE' && (
            <button onClick={onScan} className="bg-[#050a0f] border border-marine-border text-marine-muted py-2 text-[9px] font-mono tracking-widest uppercase hover:text-marine-text hover:border-marine-muted transition-colors rounded">
              Execute Regional Scan
            </button>
          )}

          {state.candidates.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-[9px] font-mono text-marine-muted uppercase tracking-widest mb-1 flex items-center justify-between">
                <span>SAR Anomalies</span>
                <span className="text-marine-text">{state.candidates.length} Detected</span>
              </div>
              {state.candidates.map((c: any, i: number) => (
                <div 
                  key={c.id} 
                  onClick={() => ['SCANNED'].includes(state.step) && onSelectCandidate(c)}
                  className={`p-2 border rounded text-xs flex justify-between items-center transition-all ${
                    state.selectedCandidate?.id === c.id 
                      ? 'border-marine-amber bg-marine-amber/10 shadow-[0_0_10px_rgba(245,158,11,0.2)]' 
                      : (state.step === 'SCANNED' ? 'border-marine-border hover:border-marine-tertiary cursor-pointer' : 'border-marine-border bg-[#020508] opacity-50')
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-marine-text text-[11px] tracking-wider uppercase">Candidate #{String(i+1).padStart(2, '0')}</span>
                    <span className="text-[9px] text-marine-muted font-mono uppercase">
                      {c.look_alike_risk || 'UNKNOWN'} Risk · {c.area_km2 ? c.area_km2.toFixed(1) : '1.0'} km²
                    </span>
                    {c.provenance && (
                      <span className={`text-[8px] font-mono px-1 py-0.5 rounded border inline-block w-max mt-0.5 ${c.provenance === 'REAL_HISTORICAL' ? 'bg-marine-green/10 text-marine-green border-marine-green/30' : c.provenance === 'SIMULATED_HISTORICAL' ? 'bg-marine-purple/10 text-marine-purple border-marine-purple/30' : 'bg-marine-tertiary/10 text-marine-tertiary border-marine-tertiary/30'}`}>
                        {c.provenance}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-mono text-marine-amber font-bold">{(c.confidence_score * 100).toFixed(1)}%</span>
                    <span className="text-[8px] text-marine-tertiary font-mono uppercase">{c.backscatter_db ? c.backscatter_db.toFixed(1) : '-18.5'} dB</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* STEP 2: INVESTIGATE */}
        {['SCANNED', 'INVESTIGATING', 'INVESTIGATED', 'CORRELATING', 'VERDICT'].includes(state.step) && (
          <div className={`flex flex-col gap-3 ${state.step === 'SCANNED' || state.step === 'INVESTIGATING' ? 'opacity-100' : 'opacity-70'}`}>
            <div className="flex items-center justify-between border-b border-marine-border pb-2">
              <div className="flex items-center gap-2 text-marine-text">
                <Navigation2 className="w-4 h-4 text-marine-muted" />
                <h3 className="text-[10px] font-bold tracking-widest uppercase text-marine-tertiary">02 INVESTIGATE</h3>
              </div>
              {state.step === 'INVESTIGATING' && <span className="text-[9px] text-marine-amber animate-pulse font-mono uppercase tracking-wider">Fetching Environment...</span>}
              {['INVESTIGATED', 'CORRELATING', 'VERDICT'].includes(state.step) && <CheckCircle2 className="w-3.5 h-3.5 text-marine-green" />}
            </div>
            
            {state.step === 'SCANNED' && state.selectedCandidate && (
              <button onClick={onInvestigate} className="bg-[#050a0f] border border-marine-border text-marine-muted py-2 text-[9px] font-mono tracking-widest uppercase hover:text-marine-text hover:border-marine-muted transition-colors rounded mt-2">
                Reconstruct Drift
              </button>
            )}

            {state.drift && (
              <div className="bg-[#050a0f] border border-marine-border p-3 rounded flex flex-col gap-2 font-mono text-[10px] mt-2">
                <div className="flex justify-between items-center border-b border-marine-border pb-2 mb-1">
                  <span className="text-marine-tertiary tracking-widest uppercase">Drift Hypothesis</span>
                  <span className="text-marine-blue font-bold tracking-wider">{state.drift.duration_hours.toFixed(1)} HOURS</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-marine-tertiary">WIND</span>
                  <span className="text-marine-text">{state.environment.wind_speed.toFixed(1)} kn @ {state.environment.wind_direction.toFixed(0)}°</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-marine-tertiary">CURRENT</span>
                  <span className="text-marine-text">{state.environment.current_speed.toFixed(2)} m/s @ {state.environment.current_direction.toFixed(0)}°</span>
                </div>
                <div className="flex justify-between mt-1 pt-2 border-t border-marine-border/50">
                  <span className="text-marine-tertiary">EST. ORIGIN</span>
                  <span className="text-marine-amber">
                    {state.drift.estimated_source 
                      ? `${state.drift.estimated_source[0].toFixed(4)}°, ${state.drift.estimated_source[1].toFixed(4)}°` 
                      : 'COMPUTING...'}
                  </span>
                </div>
                {state.environment.provenance && (
                  <div className="flex justify-between mt-1 pt-2 border-t border-marine-border/50">
                    <span className="text-marine-tertiary">ENV. PROVENANCE</span>
                    <span className={`text-[8px] font-mono px-1 py-0.5 rounded border ${state.environment.provenance === 'REAL_HISTORICAL' ? 'bg-marine-green/10 text-marine-green border-marine-green/30' : state.environment.provenance === 'SIMULATED_HISTORICAL' ? 'bg-marine-purple/10 text-marine-purple border-marine-purple/30' : 'bg-marine-tertiary/10 text-marine-tertiary border-marine-tertiary/30'}`}>
                      {state.environment.provenance}
                    </span>
                  </div>
                )}
                {state.drift.provenance && (
                  <div className="flex justify-between mt-1 pt-1">
                    <span className="text-marine-tertiary">DRIFT PROVENANCE</span>
                    <span className="text-[8px] font-mono px-1 py-0.5 rounded border bg-marine-blue/10 text-marine-blue border-marine-blue/30">
                      {state.drift.provenance}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP 3: CORRELATE */}
        {['INVESTIGATED', 'CORRELATING', 'VERDICT'].includes(state.step) && (
          <div className={`flex flex-col gap-3 ${state.step === 'INVESTIGATED' || state.step === 'CORRELATING' ? 'opacity-100' : 'opacity-70'}`}>
            <div className="flex items-center justify-between border-b border-marine-border pb-2">
              <div className="flex items-center gap-2 text-marine-text">
                <Crosshair className="w-4 h-4 text-marine-muted" />
                <h3 className="text-[10px] font-bold tracking-widest uppercase text-marine-tertiary">03 CORRELATE</h3>
              </div>
              {state.step === 'CORRELATING' && <span className="text-[9px] text-marine-amber animate-pulse font-mono uppercase tracking-wider">Querying AIS...</span>}
              {state.step === 'VERDICT' && <CheckCircle2 className="w-3.5 h-3.5 text-marine-green" />}
            </div>
            
            {state.step === 'INVESTIGATED' && (
              <button onClick={onCorrelate} className="bg-[#050a0f] border border-marine-border text-marine-muted py-2 text-[9px] font-mono tracking-widest uppercase hover:text-marine-text hover:border-marine-muted transition-colors rounded mt-2">
                Run AIS Correlation
              </button>
            )}

            {state.aisSummary && (
              <div className="bg-[#050a0f] border border-marine-border p-3 rounded flex flex-col gap-2 font-mono text-[10px] mt-2">
                <div className="flex justify-between border-b border-marine-border pb-2 mb-1">
                  <span className="text-marine-tertiary tracking-widest">AIS COVERAGE</span>
                  <span className={state.aisSummary.coverage_status === 'FULL' ? 'text-marine-green font-bold' : 'text-marine-red font-bold animate-pulse'}>
                    {state.aisSummary.coverage_status === 'FULL' ? '✓ VALID' : '✕ INSUFFICIENT'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-marine-tertiary">VESSELS TRACKED</span>
                  <span className="text-marine-text">{state.aisSummary.vessels}</span>
                </div>
                {state.aisSummary.provenance && (
                  <div className="flex justify-between mt-1 pt-2 border-t border-marine-border/50">
                    <span className="text-marine-tertiary">AIS PROVENANCE</span>
                    <span className={`text-[8px] font-mono px-1 py-0.5 rounded border ${state.aisSummary.provenance === 'REAL_HISTORICAL' ? 'bg-marine-green/10 text-marine-green border-marine-green/30' : state.aisSummary.provenance === 'SIMULATED_HISTORICAL' ? 'bg-marine-purple/10 text-marine-purple border-marine-purple/30' : 'bg-marine-tertiary/10 text-marine-tertiary border-marine-tertiary/30'}`}>
                      {state.aisSummary.provenance}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP 4: VERDICT */}
        {state.step === 'VERDICT' && state.verdict && (
          <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between border-b border-marine-border pb-2">
              <div className="flex items-center gap-2 text-marine-text">
                <ShieldCheck className="w-4 h-4 text-marine-blue" />
                <h3 className="text-sm font-bold tracking-widest uppercase">04 VERDICT</h3>
              </div>
            </div>

            {state.verdict.status === 'BLOCKED' ? (
              <div className="bg-marine-panel border border-marine-red/30 p-4 rounded mt-2 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="text-marine-red w-5 h-5 shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-0.5">
                    <h4 className="text-marine-red font-bold uppercase tracking-widest text-xs">Attribution Blocked</h4>
                    <h5 className="text-marine-red/70 font-mono uppercase tracking-wider text-[9px]">Insufficient Temporal AIS Coverage</h5>
                  </div>
                </div>
                <p className="text-[10px] text-marine-muted font-mono px-2 py-2 bg-[#03080c] rounded border border-marine-border">
                  {state.verdict.reason || 'AIS data insufficient for vessel attribution during the incident window.'}
                </p>
                <div className="border-t border-marine-border pt-3 mt-1 text-[10px] font-mono">
                  <div className="font-bold mb-1 uppercase tracking-wider text-marine-tertiary">Replay still available:</div>
                  <div className="text-marine-muted space-y-0.5 grid grid-cols-2 gap-x-2">
                    <div>✓ SATELLITE</div>
                    <div>✓ ENVIRONMENT</div>
                    <div>✓ CORRIDOR</div>
                    <div>✓ TIMELINE</div>
                  </div>
                </div>
                {onOpenReplay && (
                  <button
                    onClick={onOpenReplay}
                    className="flex items-center justify-center gap-2 w-full bg-[#03080c] border border-marine-border text-marine-text py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-marine-border transition-colors rounded mt-2"
                  >
                    <Play className="w-3 h-3 text-marine-blue" /> OPEN INCIDENT REPLAY
                  </button>
                )}
              </div>
            ) : (
              <div className="border border-marine-amber bg-[#140c02] p-5 rounded mt-2 flex flex-col shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                <h4 className="text-marine-amber text-[10px] font-bold uppercase tracking-widest mb-1">Top Attribution</h4>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-lg font-bold text-white uppercase tracking-wider">{state.verdict.vessel.name}</span>
                  <span className="text-marine-amber font-mono font-bold">{state.verdict.score.toFixed(2)} / 100</span>
                </div>
                
                {['HISTORICAL', 'HISTORICAL_INCIDENT'].includes(dataMode) && (
                  <div className="flex items-center gap-1.5 text-marine-purple text-[9px] font-mono font-bold tracking-widest mb-4 bg-marine-purple/10 border border-marine-purple/30 p-1.5 rounded">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{dataMode === 'HISTORICAL_INCIDENT' ? 'HISTORICAL RECONSTRUCTION' : 'SIMULATED HISTORICAL'}</span>
                  </div>
                )}
                {!['HISTORICAL', 'HISTORICAL_INCIDENT'].includes(dataMode) && <div className="h-4"></div>}
                
                <button onClick={onViewEvidence} className="w-full bg-marine-amber/10 border border-marine-amber text-marine-amber py-2 text-xs font-bold uppercase tracking-widest hover:bg-marine-amber hover:text-[#140c02] transition-colors rounded">
                  Why this vessel?
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default OrchestratorSidebar;
