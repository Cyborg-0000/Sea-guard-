import React from 'react';
import { Anchor, Satellite } from 'lucide-react';
import type { HistoricalSatelliteScene } from '../contexts/IncidentContext';

interface CompactMapHUDProps {
  dataMode: string;
  activeScene: HistoricalSatelliteScene | null;
}

const CompactMapHUD: React.FC<CompactMapHUDProps> = ({ dataMode, activeScene }) => {
  if (dataMode !== 'HISTORICAL_INCIDENT') return null;

  return (
    <>
      {/* Top Left: Incident Context */}
      <div className="absolute top-6 left-6 z-10 flex items-start gap-3">
        <div className="bg-[#0B141D]/90 backdrop-blur-md border border-marine-purple/40 rounded shadow-xl flex items-center p-2.5">
          <Anchor className="w-4 h-4 text-marine-purple" />
        </div>
        <div className="flex flex-col drop-shadow-md">
          <span className="text-[10px] font-bold tracking-widest uppercase text-marine-purple">WAKASHIO</span>
          <span className="text-sm font-bold text-white tracking-wide">MAURITIUS</span>
          <span className="text-[9px] text-gray-400 font-mono tracking-widest">25 JUL — 22 AUG 2020</span>
        </div>
      </div>

      {/* Top Right: Current Observation */}
      {activeScene && (
        <div className="absolute top-6 right-6 z-10 flex flex-col items-end gap-1 text-right">
          <div className="text-[9px] font-bold tracking-widest uppercase text-marine-muted">
            CURRENT OBSERVATION
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white tracking-wide">{activeScene.satellite}</span>
            <div className="bg-[#0B141D]/90 border border-[#101C26] rounded p-1.5 shadow-md">
              <Satellite className="w-3.5 h-3.5 text-marine-blue" />
            </div>
          </div>
          <div className="text-[10px] text-gray-300 font-mono tracking-widest uppercase">
            {new Date(activeScene.acquisition_time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
          
          <div className={`mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[9px] font-mono tracking-widest uppercase ${
            activeScene.provenance === 'REAL_HISTORICAL' 
              ? 'text-[#34D399] border-[#34D399]/30 bg-[#34D399]/10' 
              : activeScene.provenance === 'UNAVAILABLE'
                ? 'text-[#EF4444] border-[#EF4444]/30 bg-[#EF4444]/10'
                : 'text-[#F59E0B] border-[#F59E0B]/30 bg-[#F59E0B]/10'
          }`}>
            {activeScene.provenance}
          </div>
        </div>
      )}
    </>
  );
};

export default CompactMapHUD;
