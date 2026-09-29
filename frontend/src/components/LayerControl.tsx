import { useState } from 'react';
import { Layers, ChevronDown, ChevronUp } from 'lucide-react';

interface LayerControlProps {
  layers: Record<string, boolean>;
  setLayers: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

const LayerControl = ({ layers, setLayers }: LayerControlProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleLayer = (key: string) => {
    setLayers((prev: Record<string, boolean>) => ({ ...prev, [key]: !prev[key] }));
  };

  const layerItems = [
    { key: 'satellite', label: 'Satellite SAR' },
    { key: 'spill', label: 'Spill Detection' },
    { key: 'tracks', label: 'Historical Vessel Tracks' },
    { key: 'forward', label: 'Forward Drift Prediction' },
    { key: 'corridor', label: 'Potential Source Corridor' }
  ];

  return (
    <div className="absolute top-6 left-6 bg-marine-panel/95 backdrop-blur border border-marine-border rounded-sm shadow-xl w-60 text-marine-text text-xs z-10">
      <div 
        className="p-3 border-b border-marine-border flex justify-between items-center cursor-pointer hover:bg-white/5"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2 font-bold tracking-wider">
          <Layers className="h-4 w-4 text-marine-muted" />
          LAYERS
        </div>
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </div>
      
      {isOpen && (
        <div className="p-2 space-y-1">
          {layerItems.map(item => (
            <label 
              key={item.key} 
              className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors hover:bg-white/5`}
            >
              <span>{item.label}</span>
              <input 
                type="checkbox" 
                checked={layers[item.key]} 
                onChange={() => toggleLayer(item.key)}
                className="accent-marine-ais bg-transparent border-marine-border rounded-sm"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

export default LayerControl;
