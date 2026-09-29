import { X, Image as ImageIcon, AlertTriangle, CheckCircle } from 'lucide-react';
import React from 'react';

interface SatelliteEvidenceViewerProps {
  scene: any;
  onClose: () => void;
}

const PROVENANCE_CONFIG: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  REAL_HISTORICAL: {
    color: 'text-[#34D399]',
    label: 'Real Historical — ESA Copernicus Programme',
    icon: <CheckCircle className="w-4 h-4 text-[#34D399]" />,
  },
  SIMULATED_HISTORICAL: {
    color: 'text-[#F59E0B]',
    label: 'Simulated SAR Texture — NOT a real product',
    icon: <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />,
  },
};

const SatelliteEvidenceViewer: React.FC<SatelliteEvidenceViewerProps> = ({ scene, onClose }) => {
  if (!scene) return null;

  const prov = PROVENANCE_CONFIG[scene.provenance] ?? PROVENANCE_CONFIG.SIMULATED_HISTORICAL;
  const isSimulated = scene.provenance === 'SIMULATED_HISTORICAL';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#071018]/92 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        className="flex bg-[#0B141D] border border-[#101C26] shadow-2xl rounded overflow-hidden max-w-5xl w-full max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Main Image Area */}
        <div className="flex-1 bg-[#03080c] flex flex-col relative overflow-hidden">
          {isSimulated ? (
            /* SAR: show a clear placeholder instead of the AI texture */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
              <AlertTriangle className="w-16 h-16 text-[#F59E0B]/40" />
              <div className="max-w-sm">
                <div className="text-[#F59E0B] font-bold uppercase tracking-widest text-sm mb-2">
                  Simulated SAR Texture
                </div>
                <p className="text-marine-muted text-xs leading-relaxed">
                  Real Sentinel-1 SAR data for this date requires authenticated access via the
                  Copernicus Data Space Ecosystem (CDSE). No CDSE credentials were found in the
                  environment configuration.
                </p>
                <div className="mt-4 p-3 border border-[#F59E0B]/20 rounded bg-[#F59E0B]/5 text-left">
                  <div className="text-[10px] font-mono text-[#F59E0B] font-bold mb-1">HOW TO ACCESS REAL DATA</div>
                  <div className="text-[10px] font-mono text-marine-muted space-y-1">
                    <div>1. Register at dataspace.copernicus.eu</div>
                    <div>2. Add CDSE_USER and CDSE_PASSWORD to .env</div>
                    <div>3. Restart backend — real S-1 GRD will download</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* REAL_HISTORICAL: Display the actual ESA publication image */
            <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
              <img
                src={scene.asset_url}
                alt={scene.description}
                className="max-w-full max-h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Mauritius_oil_spill_%282020%29_-_Sentinel-2_image.jpg/1200px-Mauritius_oil_spill_%282020%29_-_Sentinel-2_image.jpg';
                }}
              />
            </div>
          )}

          {/* Source attribution bottom bar */}
          <div className="shrink-0 px-4 py-2 bg-[#03080c] border-t border-[#101C26] flex items-center gap-2">
            {prov.icon}
            <span className={`text-[10px] font-mono ${prov.color}`}>{prov.label}</span>
          </div>
        </div>

        {/* Metadata Sidebar */}
        <div className="w-72 bg-[#0B141D] border-l border-[#101C26] flex flex-col shrink-0">
          <div className="flex items-center justify-between p-4 border-b border-[#101C26]">
            <h2 className="text-xs font-bold text-marine-text tracking-widest uppercase flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-marine-blue" />
              Satellite Evidence
            </h2>
            <button onClick={onClose} className="text-marine-muted hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 flex flex-col gap-5 overflow-y-auto text-xs">

            <div>
              <div className="text-[9px] text-marine-tertiary font-mono mb-1 uppercase tracking-widest">Platform</div>
              <div className="text-marine-text font-bold">{scene.satellite}</div>
            </div>

            <div>
              <div className="text-[9px] text-marine-tertiary font-mono mb-1 uppercase tracking-widest">Acquisition</div>
              <div className="text-marine-text font-mono">
                {new Date(scene.acquisition_time).toUTCString()}
              </div>
            </div>

            <div>
              <div className="text-[9px] text-marine-tertiary font-mono mb-1 uppercase tracking-widest">Incident</div>
              <div className="text-marine-text">MV Wakashio Oil Spill</div>
              <div className="text-marine-muted text-[10px]">Pointe d'Esny, Mauritius</div>
            </div>

            <div>
              <div className="text-[9px] text-marine-tertiary font-mono mb-1 uppercase tracking-widest">Provenance</div>
              <div className={`inline-flex items-center gap-1.5 text-[10px] font-mono border px-2 py-1 rounded ${
                scene.provenance === 'REAL_HISTORICAL'
                  ? 'text-[#34D399] border-[#34D399]/30 bg-[#34D399]/10'
                  : 'text-[#F59E0B] border-[#F59E0B]/30 bg-[#F59E0B]/10'
              }`}>
                {prov.icon}
                {scene.provenance}
              </div>
            </div>

            {scene.description && (
              <div>
                <div className="text-[9px] text-marine-tertiary font-mono mb-1 uppercase tracking-widest">Description</div>
                <div className="text-marine-muted text-[10px] leading-relaxed">{scene.description}</div>
              </div>
            )}

            <div className="border border-marine-border/50 rounded p-3 bg-[#03080c]">
              <div className="text-[9px] text-marine-tertiary font-mono uppercase tracking-widest mb-2">Approx Footprint</div>
              <div className="font-mono text-[10px] text-marine-muted space-y-0.5">
                <div>W: {scene.bbox[0].toFixed(4)}° E: {scene.bbox[2].toFixed(4)}°</div>
                <div>S: {scene.bbox[1].toFixed(4)}° N: {scene.bbox[3].toFixed(4)}°</div>
              </div>
            </div>

            {scene.notes && (
              <div className="border border-[#F59E0B]/20 bg-[#F59E0B]/5 rounded p-3">
                <div className="text-[9px] text-[#F59E0B] font-bold uppercase tracking-widest mb-1">Data Usage Notice</div>
                <p className="text-[10px] text-marine-muted leading-relaxed">{scene.notes}</p>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default SatelliteEvidenceViewer;
