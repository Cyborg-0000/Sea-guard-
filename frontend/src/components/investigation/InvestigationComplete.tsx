import { RotateCcw, ChevronRight } from 'lucide-react';

interface InvestigationCompleteProps {
  investigation: any;
  onReplay: () => void;
  onViewEvidence: () => void;
}

export default function InvestigationComplete({ investigation, onReplay, onViewEvidence }: InvestigationCompleteProps) {
  if (!investigation) return null;

  return (
    <div className="absolute inset-0 bg-marine-bg/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-marine-panel border border-marine-highlight shadow-[0_0_50px_rgba(0,229,255,0.15)] rounded-sm p-8 w-[450px] flex flex-col items-center">
        
        <h2 className="text-xl font-bold tracking-widest text-white uppercase mb-8 pb-4 border-b border-marine-border w-full text-center">
          Investigation Complete
        </h2>

        <div className="w-full space-y-4 text-sm font-mono mb-8">
          <div className="flex justify-between items-center border-b border-marine-border/50 pb-2">
            <span className="text-marine-muted uppercase tracking-wider text-xs">Observed Spill</span>
            <span className="text-white font-bold">{Math.round(investigation.detection_confidence * 100)}% confidence</span>
          </div>

          <div className="flex justify-between items-center border-b border-marine-border/50 pb-2">
            <span className="text-marine-muted uppercase tracking-wider text-xs">Best Drift Window</span>
            <span className="text-marine-warning font-bold">{investigation.best_drift_hypothesis} hours</span>
          </div>

          <div className="flex justify-between items-center border-b border-marine-border/50 pb-2">
            <span className="text-marine-muted uppercase tracking-wider text-xs">Model Confidence</span>
            <span className="text-marine-highlight font-bold">{Math.round(investigation.model_confidence * 100)}%</span>
          </div>

          <div className="flex justify-between items-center pt-2">
            <span className="text-marine-muted uppercase tracking-wider text-xs">Candidate Source Vessel</span>
            <span className="text-white font-bold text-base bg-[#00e5ff]/20 px-2 py-0.5 rounded border border-[#00e5ff]">
              CRIMSON TANKER
            </span>
          </div>

          <div className="flex flex-col items-center justify-center bg-marine-bg/50 border border-marine-border rounded p-4 mt-6">
             <span className="text-[10px] text-marine-muted uppercase tracking-widest mb-1">Attribution Likelihood</span>
             <span className="text-3xl text-[#00e5ff] font-bold">{investigation.top_candidate_score.toFixed(1)} <span className="text-sm text-marine-muted">/ 100</span></span>
             
             <div className="mt-3 text-xs uppercase tracking-wider text-marine-warning font-bold flex items-center gap-2">
               Evidence Strength: {investigation.evidence_strength}
             </div>
          </div>
          
          <div className="text-center text-[9px] text-marine-muted uppercase tracking-wider pt-2">
            Analytical assessment; not a determination of legal responsibility.
          </div>
        </div>

        <div className="flex w-full gap-4">
          <button 
            onClick={onViewEvidence}
            className="flex-1 bg-marine-highlight text-marine-bg hover:bg-[#00e5ff] font-bold uppercase tracking-wider text-xs py-3 rounded transition-colors flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,229,255,0.3)]"
          >
            View Full Evidence <ChevronRight className="w-4 h-4" />
          </button>
          
          <button 
            onClick={onReplay}
            className="flex-1 bg-transparent border border-marine-highlight text-marine-highlight hover:bg-marine-highlight/20 font-bold uppercase tracking-wider text-xs py-3 rounded transition-colors flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" /> Replay Again
          </button>
        </div>

      </div>
    </div>
  );
}
