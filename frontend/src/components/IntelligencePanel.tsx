import React from 'react';
import OrchestratorSidebar from './OrchestratorSidebar';
import EvidenceGraph from './investigation/EvidenceGraph';
import EvidenceDetails from './investigation/EvidenceDetails';
import type { HistoricalSatelliteScene } from '../contexts/IncidentContext';
import ObservationStrip from './investigation/ObservationStrip';

interface IntelligencePanelProps {
  dataMode: string;

  orchestratorState: any;
  handleScan: () => void;
  handleInvestigate: () => void;
  handleCorrelate: () => void;
  handleViewEvidence: () => void;
  handleSelectCandidate: (candidate: any) => void;
  setIsInvestigationMode: (mode: boolean) => void;
  
  isInvestigationMode: boolean;
  investigationData: any;
  selectedEvidenceNode: any;
  handleNodeSelect: (node: any) => void;
  setSelectedEvidenceNode: (node: any) => void;
  replayLayerStates: any;

  activeScene: HistoricalSatelliteScene | null;
  incidentContext: any;
  currentTimelineTime: number;
  handleManualTimeChange: (time: number) => void;
  selectedVessel?: any;
}

const IntelligencePanel: React.FC<IntelligencePanelProps> = ({
  dataMode,
  orchestratorState, handleScan, handleInvestigate, handleCorrelate,
  handleViewEvidence, handleSelectCandidate, setIsInvestigationMode,
  isInvestigationMode, investigationData, selectedEvidenceNode,
  handleNodeSelect, setSelectedEvidenceNode, replayLayerStates,
  activeScene, incidentContext, currentTimelineTime, handleManualTimeChange, selectedVessel
}) => {

  return (
    <div className="flex-1 flex flex-col overflow-hidden w-full h-full bg-[#0a131c]">
      {!isInvestigationMode ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <OrchestratorSidebar
              dataMode={dataMode}
              state={orchestratorState}
              onScan={handleScan}
              onInvestigate={handleInvestigate}
              onCorrelate={handleCorrelate}
              onViewEvidence={handleViewEvidence}
              onSelectCandidate={handleSelectCandidate}
              onOpenReplay={() => setIsInvestigationMode(true)}
            />
          </div>
          
          {selectedVessel && (dataMode === 'LIVE' || dataMode === 'DEMO_REPLAY') && (
            <div className="shrink-0 p-4 border-t border-[#101C26] bg-[#050a0f]">
              <h2 className="text-[10px] font-bold tracking-widest uppercase text-marine-muted mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-marine-blue"></span>
                Vessel Inspector
              </h2>
              <div className="space-y-2">
                <div className="flex justify-between border-b border-[#101C26] pb-1">
                  <span className="text-[10px] text-marine-muted font-mono">NAME</span>
                  <span className="text-[10px] text-marine-text font-bold uppercase">{selectedVessel.name || 'UNKNOWN'}</span>
                </div>
                <div className="flex justify-between border-b border-[#101C26] pb-1">
                  <span className="text-[10px] text-marine-muted font-mono">TYPE</span>
                  <span className="text-[10px] text-marine-blue font-bold uppercase">{selectedVessel.type || 'UNKNOWN'}</span>
                </div>
                <div className="flex justify-between border-b border-[#101C26] pb-1">
                  <span className="text-[10px] text-marine-muted font-mono">MMSI</span>
                  <span className="text-[10px] text-marine-text font-mono">{selectedVessel.mmsi || 'UNKNOWN'}</span>
                </div>
                <div className="flex justify-between border-b border-[#101C26] pb-1">
                  <span className="text-[10px] text-marine-muted font-mono">SPEED</span>
                  <span className="text-[10px] text-marine-text font-mono">
                    {selectedVessel.positions?.length > 0 ? selectedVessel.positions[selectedVessel.positions.length - 1].speed.toFixed(1) + ' kn' : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-[#101C26] pb-1">
                  <span className="text-[10px] text-marine-muted font-mono">HEADING</span>
                  <span className="text-[10px] text-marine-text font-mono">
                    {selectedVessel.positions?.length > 0 ? Math.round(selectedVessel.positions[selectedVessel.positions.length - 1].heading) + '°' : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-[10px] text-marine-muted font-mono">DESTINATION</span>
                  <span className="text-[10px] text-[#F59E0B] font-mono">
                    {selectedVessel.destination ? selectedVessel.destination.toUpperCase() : 'NOT AVAILABLE'}
                  </span>
                </div>
              </div>
            </div>
          )}
          
        </div>
      ) : (
        investigationData && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#101C26] flex justify-between items-center bg-[#050a0f] shrink-0">
              <h2 className="text-xs font-bold tracking-widest uppercase text-marine-muted">Evidence Graph</h2>
              <div className="flex items-center gap-2">
                <div className="text-[10px] bg-marine-bg border border-[#101C26] px-2 py-1 rounded text-marine-blue font-mono tracking-wider">
                  Q: {Math.round(investigationData.data_quality * 100)}%
                </div>
                <button 
                  onClick={() => setIsInvestigationMode(false)}
                  className="text-[10px] text-marine-muted hover:text-marine-text border border-[#101C26] px-2 py-1 rounded transition-colors"
                >
                  ← Back
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto custom-scrollbar relative">
              <EvidenceGraph
                nodes={investigationData.nodes}
                edges={investigationData.edges}
                selectedNodeId={selectedEvidenceNode?.id}
                onNodeSelect={handleNodeSelect}
                replayLayerStates={replayLayerStates}
              />
            </div>
            
            <ObservationStrip
              scenes={incidentContext?.satellite_scenes || []}
              activeSceneId={activeScene?.id || null}
              currentTimelineTime={currentTimelineTime}
              onSelectTime={handleManualTimeChange}
              dataMode={dataMode}
            />

            {selectedEvidenceNode && (
              <EvidenceDetails
                node={selectedEvidenceNode}
                onClose={() => setSelectedEvidenceNode(null)}
              />
            )}
          </div>
        )
      )}
    </div>
  );
};

export default IntelligencePanel;
