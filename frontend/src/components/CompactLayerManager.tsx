import React from 'react';
import { Layers } from 'lucide-react';

interface LayerGroup {
  name: string;
  layers: { id: string; label: string; color: string; visible: boolean; provenance?: string }[];
}

interface CompactLayerManagerProps {
  layersVisible: Record<string, boolean>;
  setLayersVisible: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  vesselFilters: Record<string, boolean>;
  setVesselFilters: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  dataMode: string;
  isOpen: boolean;
  onClose: () => void;
}

const CompactLayerManager: React.FC<CompactLayerManagerProps> = ({ 
  layersVisible, setLayersVisible, vesselFilters = {}, setVesselFilters, dataMode, isOpen, onClose
}) => {

  const toggleLayer = (id: string) => {
    setLayersVisible(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleVesselFilter = (id: string) => {
    if (id === 'ALL') {
      const isAll = !vesselFilters['ALL'];
      setVesselFilters({ ALL: isAll, TANKER: false, CARGO: false, CONTAINER: false, PASSENGER: false, UNKNOWN: false });
    } else {
      setVesselFilters(prev => ({ ...prev, [id]: !prev[id], ALL: false }));
    }
  };

  const isHistorical = dataMode === 'HISTORICAL_INCIDENT';

  const groups: LayerGroup[] = [
    {
      name: 'BASE LAYERS',
      layers: [
        { id: 'satellite', label: 'Satellite (Esri World Imagery)', color: 'bg-marine-text', visible: layersVisible.satellite },
      ]
    },
    {
      name: 'OPERATIONAL LAYERS',
      layers: [
        { id: 'vessels', label: `Oil Tankers${dataMode === 'LIVE' ? ' (Live)' : ''}`, color: 'bg-marine-green', visible: layersVisible.vessels !== false },
        { id: 'tracks', label: 'Vessel Tracks', color: 'bg-marine-green', visible: layersVisible.tracks },
        { id: 'spill', label: 'SAR Anomalies / Spill Extent', color: 'bg-marine-green', visible: layersVisible.spill },
        ...(isHistorical ? [{ id: 'grounding', label: 'Grounding Site', color: 'bg-marine-green', visible: layersVisible.grounding !== false }] : []),
        { id: 'wind', label: 'Wind Vectors', color: 'bg-marine-green', visible: layersVisible.wind },
        { id: 'current', label: 'Currents', color: 'bg-marine-green', visible: layersVisible.current },
        { id: 'corridor', label: 'Source Corridor', color: 'bg-marine-green', visible: layersVisible.corridor, provenance: 'COMPUTED' },
        ...(!isHistorical ? [{ id: 'forward', label: 'Forward Drift', color: 'bg-marine-green', visible: layersVisible.forward, provenance: 'COMPUTED' }] : [])
      ]
    }
  ];

  const vesselFilterOptions = [
    { id: 'ALL', label: 'All Supported Vessels' },
    { id: 'TANKER', label: 'Oil Tankers' },
    { id: 'CARGO', label: 'Cargo' },
    { id: 'CONTAINER', label: 'Container' },
    { id: 'PASSENGER', label: 'Passenger' },
    { id: 'UNKNOWN', label: 'Unknown' },
  ];

  return (
    <div className={`absolute top-0 left-0 bg-[#050a0f]/95 backdrop-blur-md border-r border-[#101C26] shadow-2xl z-20 transition-all duration-300 overflow-hidden flex flex-col h-full ${isOpen ? 'w-[280px]' : 'w-0 border-r-0'}`}>
      <div className="px-4 py-3 border-b border-[#101C26] flex items-center justify-between bg-[#0a131c]">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-marine-muted" />
          <span className="text-[10px] font-bold tracking-widest uppercase text-marine-muted">Layers</span>
        </div>
        <button onClick={onClose} className="text-marine-muted hover:text-white">✕</button>
      </div>
      
      {isOpen && (
        <div className="p-4 overflow-y-auto flex flex-col gap-5 custom-scrollbar">
          {groups.map(g => (
            <div key={g.name} className="flex flex-col gap-2">
              <div className="text-[10px] font-mono tracking-wider text-marine-muted">{g.name}</div>
              <div className="flex flex-col gap-1.5">
                {g.layers.map(l => (
                  <button
                    key={l.id}
                    onClick={() => toggleLayer(l.id)}
                    className="flex items-center gap-3 py-1 text-left group"
                  >
                    <div className="w-3.5 h-3.5 border border-marine-muted/50 rounded-sm flex items-center justify-center shrink-0 group-hover:border-marine-green transition-colors">
                      {l.visible && <div className="w-2 h-2 bg-marine-green rounded-sm"></div>}
                    </div>
                    <span className={`text-[11px] font-sans tracking-wide truncate ${l.visible ? 'text-marine-text' : 'text-marine-muted'}`}>
                      {l.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}

        {/* Vessel Filtering */}
        {!isHistorical && (
          <div className="flex flex-col gap-1.5 pt-2 border-t border-[#101C26]">
            <div className="text-[9px] font-mono tracking-widest uppercase text-marine-tertiary">VESSEL FILTER</div>
            <div className="flex flex-col gap-1">
              {vesselFilterOptions.map(f => (
                <button
                  key={f.id}
                  onClick={() => toggleVesselFilter(f.id)}
                  className="flex items-center gap-2 py-1 px-1.5 hover:bg-[#101C26]/50 rounded transition-colors text-left"
                >
                  <div className={`w-3 h-3 rounded-sm border flex items-center justify-center transition-colors ${
                    vesselFilters[f.id] ? 'bg-marine-blue border-marine-blue text-white' : 'border-marine-muted/30 bg-transparent'
                  }`}>
                    {vesselFilters[f.id] && <svg viewBox="0 0 14 14" fill="none" className="w-2.5 h-2.5"><path d="M3 7.5L6 10.5L11 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <span className={`text-[10px] font-mono ${vesselFilters[f.id] ? 'text-marine-text' : 'text-marine-muted'}`}>{f.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
          </div>
        )}
      </div>
  );
};

export default CompactLayerManager;
