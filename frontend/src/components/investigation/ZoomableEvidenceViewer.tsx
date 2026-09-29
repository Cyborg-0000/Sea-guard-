import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, AlertTriangle, ShieldCheck, Maximize, X } from 'lucide-react';
import type { HistoricalSatelliteScene } from '../../contexts/IncidentContext';

interface ZoomableEvidenceViewerProps {
  scene: HistoricalSatelliteScene;
  onClose: () => void;
}

const ZoomableEvidenceViewer: React.FC<ZoomableEvidenceViewerProps> = ({ scene, onClose }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  
  const isReal = scene.provenance === 'REAL_HISTORICAL';
  const isUnavailable = scene.provenance === 'UNAVAILABLE';

  // Handle drag pan
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };
  
  // Attach non-passive wheel event listener manually to prevent body scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSensitivity = 0.1;
      setScale(prev => Math.max(0.5, Math.min(5, prev - (e.deltaY > 0 ? zoomSensitivity : -zoomSensitivity))));
    };
    
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className="absolute top-0 right-0 h-full w-[500px] z-50 bg-[#071018] border-l border-[#101C26] shadow-2xl flex flex-col transform transition-transform duration-300">
      
      {/* HEADER */}
      <div className="p-4 border-b border-[#101C26] flex items-center justify-between bg-[#0B141D]">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-marine-text tracking-widest uppercase">{scene.satellite}</span>
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase ${
              isReal ? 'bg-[#34D399]/10 text-[#34D399] border-[#34D399]/30' : 
              isUnavailable ? 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30' : 
              'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30'
            }`}>
              {isReal ? 'REAL' : isUnavailable ? 'UNAVAILABLE' : 'SIMULATED'}
            </span>
          </div>
          <span className="text-[10px] text-marine-muted font-mono">{new Date(scene.acquisition_time).toLocaleDateString()}</span>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-[#101C26] rounded text-marine-muted hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      
      {/* TOOLBAR */}
      <div className="p-2 border-b border-[#101C26] flex items-center justify-center gap-2 bg-[#050a0f]">
        <button onClick={() => setScale(prev => Math.max(0.5, prev - 0.2))} className="p-1.5 hover:bg-[#101C26] rounded text-marine-muted hover:text-white" title="Zoom Out"><ZoomOut className="w-4 h-4" /></button>
        <div className="w-16 text-center text-[10px] font-mono text-marine-text">{Math.round(scale * 100)}%</div>
        <button onClick={() => setScale(prev => Math.min(5, prev + 0.2))} className="p-1.5 hover:bg-[#101C26] rounded text-marine-muted hover:text-white" title="Zoom In"><ZoomIn className="w-4 h-4" /></button>
        <div className="w-px h-4 bg-[#101C26] mx-1"></div>
        <button onClick={() => { setScale(1); setPosition({x:0, y:0}); }} className="p-1.5 hover:bg-[#101C26] rounded text-marine-muted hover:text-white text-[10px] uppercase font-bold tracking-wider" title="Reset Zoom">Fit</button>
        <button onClick={() => { setScale(2); setPosition({x:0, y:0}); }} className="p-1.5 hover:bg-[#101C26] rounded text-marine-muted hover:text-white" title="100%"><Maximize className="w-4 h-4" /></button>
      </div>

      {/* VIEWPORT */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-black cursor-move flex items-center justify-center"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* Alignment Grid Overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
        
        {isUnavailable ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-[#EF4444]/5 border border-[#EF4444]/10 z-10">
            <AlertTriangle className="w-12 h-12 text-[#EF4444]/40 mb-3" />
            <div className="text-xs text-[#EF4444] font-bold uppercase tracking-widest mb-2">Asset Unavailable</div>
            <p className="text-[10px] text-marine-muted leading-relaxed font-mono">
              The high-resolution raw asset requires authenticated CDSE access. Georeferenced footprint is shown on the map for geographical context.
            </p>
          </div>
        ) : (
          <div 
            className="absolute transition-transform duration-75 ease-linear will-change-transform"
            style={{ 
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: 'center center'
            }}
          >
            <img 
              src={scene.asset_url} 
              alt={scene.description}
              className="max-w-none shadow-2xl"
              style={{ width: '100%', height: 'auto', minWidth: '400px' }}
              draggable="false"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/demo_sar.jpg';
              }}
            />
          </div>
        )}
      </div>

      {/* METADATA FOOTER */}
      <div className="p-4 border-t border-[#101C26] bg-[#0B141D] flex flex-col gap-3">
        <div className="flex items-start gap-2">
          {isReal ? <ShieldCheck className="w-4 h-4 text-[#34D399] shrink-0 mt-0.5" /> : 
           isUnavailable ? <AlertTriangle className="w-4 h-4 text-[#EF4444] shrink-0 mt-0.5" /> :
           <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />}
          <div className="flex flex-col gap-0.5">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${isReal ? 'text-[#34D399]' : isUnavailable ? 'text-[#EF4444]' : 'text-[#F59E0B]'}`}>
              {isReal ? 'Real Evidence' : isUnavailable ? 'Data Blocked' : 'Simulated Stand-In'}
            </span>
            <span className="text-[9px] text-marine-muted font-mono leading-tight">
              {isReal ? 'Publication-derived imagery. Not a raw georeferenced product.' : 
               isUnavailable ? 'Raw Sentinel-2 asset requires Copernicus Data Space authentication.' :
               'Synthetic footprint for historical orchestration context.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ZoomableEvidenceViewer;
