import React from 'react';
import { Satellite, AlertTriangle } from 'lucide-react';
import type { HistoricalSatelliteScene } from '../contexts/IncidentContext';

interface Props {
  scene: HistoricalSatelliteScene;
}

const SatelliteInfoPanel: React.FC<Props> = ({ scene }) => {
  const isReal = scene.provenance === 'REAL_HISTORICAL';

  return (
    <div className="absolute top-6 left-6 bg-marine-panel/90 backdrop-blur border border-marine-border rounded-sm shadow-xl w-80 text-marine-text text-sm p-4 space-y-3 z-10 animate-fade-in">
      <div className="flex items-start justify-between border-b border-marine-border pb-2">
        <div className="flex items-center gap-2 text-marine-blue font-bold tracking-wider uppercase">
          <Satellite className="w-4 h-4" />
          <span>SATELLITE OBSERVATION</span>
        </div>
      </div>
      
      <div className="space-y-1 font-mono text-xs">
        <div className="flex justify-between">
          <span className="text-marine-muted">PLATFORM</span>
          <span className="font-bold text-marine-text">{scene.satellite}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-marine-muted">ACQUISITION</span>
          <span className="text-marine-text">{new Date(scene.acquisition_time).toISOString().replace('T', ' ').substring(0, 16)} UTC</span>
        </div>
        {scene.product_id && (
          <div className="flex justify-between">
            <span className="text-marine-muted">PRODUCT ID</span>
            <span className="text-marine-text truncate max-w-[150px]" title={scene.product_id}>{scene.product_id}</span>
          </div>
        )}
      </div>

      <div className="text-xs border-l-2 border-marine-blue/30 pl-2 text-marine-muted italic">
        {scene.description}
      </div>

      {scene.notes && (
        <div className={`p-2 rounded text-[10px] uppercase tracking-wide flex gap-2 items-start ${isReal ? 'bg-marine-blue/10 text-marine-blue' : 'bg-marine-warning/10 text-marine-warning border border-marine-warning/30'}`}>
          {!isReal && <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />}
          <span>{scene.notes}</span>
        </div>
      )}

      <div className="pt-2 border-t border-marine-border flex flex-col gap-1">
        <div className="flex items-center gap-2 justify-between">
          <span className="text-[10px] text-marine-muted uppercase tracking-wider">PROVENANCE</span>
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold ${isReal ? 'bg-marine-spill/20 text-marine-spill border border-marine-spill/50' : 'bg-marine-warning/20 text-marine-warning border border-marine-warning/50'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isReal ? 'bg-marine-spill' : 'bg-marine-warning'}`}></span>
            {scene.provenance.replace('_', ' ')}
          </div>
        </div>
        {scene.source_attribution && (
          <div className="text-[9px] text-marine-muted text-right italic">
            {scene.source_attribution}
          </div>
        )}
      </div>
    </div>
  );
};

export default SatelliteInfoPanel;
