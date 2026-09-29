import { X } from 'lucide-react';

interface EvidenceDetailsProps {
  node: any;
  onClose: () => void;
}

export default function EvidenceDetails({ node, onClose }: EvidenceDetailsProps) {
  if (!node) return null;

  const renderDataField = (label: string, value: any) => (
    <div className="flex flex-col mb-3">
      <span className="text-[10px] uppercase text-marine-muted tracking-wider">{label}</span>
      <span className="text-sm font-mono text-white">{value}</span>
    </div>
  );

  const renderAttributionDetails = (data: any) => {
    // Generate Supporting and Contradictory logic dynamically based on scores
    // This implements the hard test: Crimson vs Ocean Voyager

    const supports = [];
    const limits = [];
    
    // Spatial (0-25)
    if (data.spatial_score >= 15) supports.push("Close proximity to potential source");
    else limits.push(`Spatial approach relatively far (${data.explanation.spatial})`);

    // Temporal (0-20)
    if (data.temporal_score >= 15) supports.push("Historical position is compatible with estimated source time");
    else limits.push(`Temporal offset mismatch (${data.explanation.temporal})`);

    // Trajectory (0-25)
    if (data.trajectory_score >= 15) supports.push("Trajectory intersects source corridor");
    else limits.push(`Heading deviates significantly (${data.explanation.trajectory})`);

    // Drift (0-20)
    if (data.drift_score >= 15) supports.push("Strong drift compatibility with spill");
    else limits.push(`Poor drift compatibility (${data.explanation.drift})`);

    return (
      <div className="mt-4">
        <h3 className="text-xs uppercase tracking-wider text-marine-muted font-bold mb-2 border-b border-marine-border pb-1">Component Breakdown</h3>
        
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-xs font-mono"><span className="text-marine-muted">Spatial</span><span>{data.spatial_score.toFixed(1)} / 25</span></div>
          <div className="w-full h-1 bg-marine-bg"><div className="h-full bg-marine-highlight" style={{ width: `${(data.spatial_score / 25) * 100}%` }}></div></div>

          <div className="flex justify-between text-xs font-mono"><span className="text-marine-muted">Temporal</span><span>{data.temporal_score.toFixed(1)} / 20</span></div>
          <div className="w-full h-1 bg-marine-bg"><div className="h-full bg-marine-highlight" style={{ width: `${(data.temporal_score / 20) * 100}%` }}></div></div>

          <div className="flex justify-between text-xs font-mono"><span className="text-marine-muted">Trajectory</span><span>{data.trajectory_score.toFixed(1)} / 25</span></div>
          <div className="w-full h-1 bg-marine-bg"><div className="h-full bg-[#00e5ff]" style={{ width: `${(data.trajectory_score / 25) * 100}%` }}></div></div>

          <div className="flex justify-between text-xs font-mono"><span className="text-marine-muted">Drift</span><span>{data.drift_score.toFixed(1)} / 20</span></div>
          <div className="w-full h-1 bg-marine-bg"><div className="h-full bg-marine-warning" style={{ width: `${(data.drift_score / 20) * 100}%` }}></div></div>
        </div>

        <h3 className="text-xs uppercase tracking-wider text-marine-muted font-bold mb-2">Supporting Evidence</h3>
        <ul className="text-xs space-y-1 mb-4 text-[#00e5ff]">
          {supports.map((txt, i) => <li key={i}>✓ {txt}</li>)}
        </ul>

        <h3 className="text-xs uppercase tracking-wider text-marine-muted font-bold mb-2">Contradictory / Limiting</h3>
        <ul className="text-xs space-y-1 text-marine-warning">
          {limits.map((txt, i) => <li key={i}>⚠ {txt}</li>)}
          <li key="env">⚠ Environmental model confidence is 74%</li>
        </ul>
      </div>
    );
  };

  return (
    <div className="absolute top-16 right-0 w-80 h-[calc(100vh-12rem)] bg-marine-panel/95 backdrop-blur border-l border-marine-border shadow-2xl flex flex-col z-30 transform transition-transform">
      <div className="flex justify-between items-center p-4 border-b border-marine-border bg-marine-bg/50">
        <h2 className="text-sm font-bold tracking-wider uppercase text-white flex gap-2">
          Evidence Details
        </h2>
        <button onClick={onClose} className="text-marine-muted hover:text-white"><X className="w-4 h-4" /></button>
      </div>

      <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
        <h3 className="text-lg font-bold text-white mb-4">{node.title}</h3>
        
        {renderDataField("Type", node.type)}
        {renderDataField("Source", node.source)}
        {node.timestamp && renderDataField("Timestamp", new Date(node.timestamp).toISOString().replace('T', ' ').substring(0, 19) + ' UTC')}
        {node.confidence && renderDataField("Confidence", `${Math.round(node.confidence * 100)}%`)}
        
        {node.data && node.type.toLowerCase() !== 'attribution' && node.type.toLowerCase() !== 'satellite' && (
           <div className="mt-4 bg-marine-bg p-3 border border-marine-border rounded font-mono text-[10px] text-marine-highlight whitespace-pre-wrap">
             {JSON.stringify(node.data, null, 2)}
           </div>
        )}

        {node.type.toLowerCase() === 'satellite' && (
          <div className="mt-4">
            <h3 className="text-xs uppercase tracking-wider text-marine-muted font-bold mb-2 border-b border-marine-border pb-1">Confidence Breakdown</h3>
            
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-xs font-mono"><span className="text-marine-muted">Anomaly Strength</span><span className="text-green-400">+{node.data.confidence_breakdown?.anomaly_strength || 0}</span></div>
              <div className="flex justify-between text-xs font-mono"><span className="text-marine-muted">Shape Compatibility</span><span className="text-green-400">+{node.data.confidence_breakdown?.shape_compatibility || 0}</span></div>
              <div className="flex justify-between text-xs font-mono"><span className="text-marine-muted">Wind Penalty</span><span className="text-red-400">{node.data.confidence_breakdown?.environmental_penalty || 0}</span></div>
              <div className="border-t border-marine-border/50 pt-1 flex justify-between text-xs font-bold font-mono">
                <span className="text-white">Heuristic Confidence</span>
                <span className="text-marine-highlight">{Math.round((node.confidence || 0) * 100)}%</span>
              </div>
            </div>

            {node.data.look_alike_risk && (
              <div className={`mt-2 p-2 border rounded text-xs font-bold uppercase text-center
                ${node.data.look_alike_risk === 'HIGH' ? 'bg-red-900/30 border-red-500 text-red-400' : 
                  node.data.look_alike_risk === 'MEDIUM' ? 'bg-yellow-900/30 border-yellow-500 text-yellow-400' : 
                  'bg-green-900/30 border-green-500 text-green-400'}`}>
                Look-Alike Risk: {node.data.look_alike_risk}
              </div>
            )}
            
            <div className="mt-4 bg-marine-bg p-3 border border-marine-border rounded font-mono text-[10px] text-marine-highlight whitespace-pre-wrap">
              {JSON.stringify(node.data, null, 2)}
            </div>
          </div>
        )}

        {node.type.toLowerCase() === 'attribution' && renderAttributionDetails(node.data)}
      </div>
    </div>
  );
}
