import React from 'react';
import { Clock, Eye } from 'lucide-react';
import type { HistoricalSatelliteScene } from '../../contexts/IncidentContext';

interface ObservationStripProps {
  scenes: HistoricalSatelliteScene[];
  activeSceneId: string | null;
  currentTimelineTime: number;
  onSelectTime: (time: number) => void;
  dataMode: string;
}

const ObservationStrip: React.FC<ObservationStripProps> = ({ scenes, activeSceneId, onSelectTime, dataMode }) => {
  if (dataMode !== 'HISTORICAL_INCIDENT' || !scenes || scenes.length === 0) return null;

  return (
    <div className="border-t border-[#101C26] bg-[#0B141D] shrink-0 p-3 flex flex-col gap-2">
      <div className="text-[9px] font-bold tracking-widest uppercase text-marine-tertiary flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          Satellite Observations
        </div>
        <span className="text-marine-muted">{scenes.length} Captures</span>
      </div>
      <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto custom-scrollbar">
        {scenes.map((scene) => {
          const isActive = activeSceneId === scene.id;
          const sceneTime = new Date(scene.acquisition_time).getTime();
          // The observation should only be highlighted if we're past its time, but since it's a selector, 
          // we want to see ALL observations so the user can jump to them.
          const isReal = scene.provenance === 'REAL_HISTORICAL';
          
          return (
            <button
              key={scene.id}
              onClick={() => onSelectTime(sceneTime)}
              className={`text-left p-2 rounded border flex flex-col gap-1.5 transition-all group ${
                isActive 
                  ? (isReal ? 'bg-[#34D399]/10 border-[#34D399]/50' : 'bg-[#F59E0B]/10 border-[#F59E0B]/50')
                  : 'bg-transparent border-[#101C26] hover:border-marine-muted/30 hover:bg-[#101C26]/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold font-mono uppercase tracking-widest ${isActive ? 'text-marine-text' : 'text-marine-muted group-hover:text-marine-text'}`}>
                  {scene.satellite} · {scene.satellite.includes('1') ? 'SAR' : 'OPTICAL'}
                </span>
                <span className={`text-[9px] font-mono ${isActive ? 'text-marine-text' : 'text-marine-tertiary'}`}>
                  {new Date(scene.acquisition_time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className={`text-[8px] px-1.5 py-0.5 rounded border font-mono tracking-widest uppercase ${
                  isReal 
                    ? 'text-[#34D399] border-[#34D399]/30 bg-[#34D399]/10' 
                    : 'text-[#F59E0B] border-[#F59E0B]/30 bg-[#F59E0B]/10'
                }`}>
                  {isReal ? 'REAL' : 'SIMULATED'}
                </span>
                
                {isActive && (
                  <span className="text-[8px] text-marine-text font-bold uppercase tracking-widest flex items-center gap-1">
                    <Eye className="w-3 h-3" /> ACTIVE
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  );
};

export default ObservationStrip;
