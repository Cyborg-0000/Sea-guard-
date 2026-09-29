export default function InvestigationHeader({ investigation, systemStatus }: { investigation: any, systemStatus?: any }) {
  if (!investigation) return null;
  const mode = systemStatus?.data_mode?.replace('_', ' ') || 'DEMO REPLAY';
  return (
    <div className="absolute top-0 left-0 w-full h-16 bg-marine-panel/95 backdrop-blur border-b border-marine-border flex items-center px-6 z-20 justify-between text-marine-text shadow-lg">
      <div className="flex flex-col">
        <h1 className="font-bold tracking-wider text-sm uppercase text-marine-highlight">
          MarineGuard AI <span className="text-marine-muted ml-2">Investigation Mode</span>
        </h1>
        <div className="text-xs text-marine-muted font-mono flex gap-4">
          <span>INCIDENT #{investigation.incident_id.substring(0, 8).toUpperCase()}</span>
          <span>Detected: 18:00 UTC</span>
          <span className="text-marine-warning ml-4">● {mode}</span>
        </div>
      </div>
      
      <div className="flex gap-8 items-center h-full">
        <div className="flex flex-col h-full justify-center">
          <span className="text-[10px] uppercase text-marine-muted tracking-wider">Detection Confidence</span>
          <span className="font-mono text-sm text-marine-critical">{Math.round(investigation.detection_confidence * 100)}%</span>
        </div>
        
        <div className="w-px h-8 bg-marine-border"></div>

        <div className="flex flex-col h-full justify-center">
          <span className="text-[10px] uppercase text-marine-muted tracking-wider">Drift Hypothesis</span>
          <span className="font-mono text-sm text-marine-warning">{investigation.best_drift_hypothesis} hours</span>
        </div>

        <div className="w-px h-8 bg-marine-border"></div>

        <div className="flex flex-col h-full justify-center">
          <span className="text-[10px] uppercase text-marine-muted tracking-wider">Model Confidence</span>
          <span className="font-mono text-sm text-marine-highlight">{Math.round(investigation.model_confidence * 100)}%</span>
        </div>

        <div className="w-px h-8 bg-marine-border"></div>

        <div className="flex flex-col h-full justify-center">
          <span className="text-[10px] uppercase text-marine-muted tracking-wider">Top Candidate</span>
          <span className="font-mono text-sm font-bold text-white">Crimson Tanker</span>
        </div>

        <div className="w-px h-8 bg-marine-border"></div>

        <div className="flex flex-col h-full justify-center">
          <span className="text-[10px] uppercase text-marine-muted tracking-wider">Attribution Likelihood</span>
          <span className="font-mono text-sm text-[#00e5ff]">{investigation.top_candidate_score.toFixed(1)} / 100</span>
        </div>
      </div>
    </div>
  );
}
