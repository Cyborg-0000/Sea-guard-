import React from 'react';
import HistoricalTimelineController from './investigation/HistoricalTimelineController';
import IncidentTimeline from './investigation/IncidentTimeline';
import ReplayController from './investigation/ReplayController';
import { Database } from 'lucide-react';

interface BottomDashboardProps {
  dataMode: string;
  activeTimeline: any[];
  WAKASHIO_TIMELINE: any[];
  currentTimelineTime: number;
  setCurrentTimelineTime: React.Dispatch<React.SetStateAction<number>>;
  startTime: number;
  endTime: number;
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  handleManualTimeChange: (time: number) => void;
  handleNodeSelect: (node: any) => void;
  investigationData: any;
  orchestratorState: any;
  activeScene: any;
  handleReplayComplete: () => void;
}

const BottomDashboard: React.FC<BottomDashboardProps> = ({
  dataMode, activeTimeline, WAKASHIO_TIMELINE, currentTimelineTime, setCurrentTimelineTime,
  startTime, endTime, isPlaying, setIsPlaying, handleManualTimeChange, handleNodeSelect,
  investigationData, orchestratorState, activeScene, handleReplayComplete
}) => {
  return (
    <div className="h-56 bg-[#050a0f] border-t border-[#101C26] shrink-0 shadow-lg relative z-20 flex flex-col w-full text-marine-text overflow-hidden">
      {/* Top Row: Timeline */}
      <div className="flex-1 flex border-b border-[#101C26] relative h-28">
        {dataMode === 'HISTORICAL_INCIDENT' && WAKASHIO_TIMELINE.length > 0 ? (
          <HistoricalTimelineController
            timeline={WAKASHIO_TIMELINE}
            currentTimelineTime={currentTimelineTime}
            setCurrentTimelineTime={setCurrentTimelineTime}
            orchestratorStep={orchestratorState.step}
            verdict={orchestratorState.verdict}
            onEventSelect={(evt: any) => {
              handleManualTimeChange(new Date(evt.timestamp).getTime());
              if (evt.related_node_id && investigationData) {
                const node = investigationData.nodes?.find((n: any) => n.id === evt.related_node_id);
                if (node) handleNodeSelect(node);
              }
            }}
          />
        ) : (
          <div className="flex-1 relative w-full h-full">
            <IncidentTimeline
              timeline={activeTimeline}
              currentTimelineTime={currentTimelineTime}
              onTimeChange={handleManualTimeChange}
              onEventSelect={(evt: any) => {
                handleManualTimeChange(new Date(evt.timestamp).getTime());
                if (evt.related_node_id && investigationData) {
                  const node = investigationData.nodes?.find((n: any) => n.id === evt.related_node_id);
                  if (node) handleNodeSelect(node);
                }
              }}
            />
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30">
              <ReplayController
                currentTimelineTime={currentTimelineTime}
                setCurrentTimelineTime={setCurrentTimelineTime}
                startTime={startTime}
                endTime={endTime}
                isPlaying={isPlaying}
                setIsPlaying={setIsPlaying}
                onReplayComplete={handleReplayComplete}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Row: 4 Widgets */}
      <div className="h-28 flex shrink-0 divide-x divide-[#101C26]">
        {/* Widget 1: Current Scene */}
        <div className="flex-1 p-3 flex flex-col gap-1.5 min-w-[200px]">
          <div className="text-[9px] font-bold tracking-widest uppercase text-marine-tertiary">CURRENT SCENE</div>
          {activeScene ? (
            <div className="flex gap-3 h-full pb-1">
              <img src={activeScene.thumbnail_url} alt="Scene" className="h-full object-cover border border-marine-border rounded opacity-80" style={{aspectRatio: '1'}} />
              <div className="flex flex-col justify-center leading-tight">
                <span className="text-[10px] font-bold text-marine-green tracking-wider">{activeScene.sensor_type || 'SAR OBSERVATION'}</span>
                <span className="text-[9px] text-marine-text font-mono mt-0.5">{new Date(activeScene.acquisition_time).toLocaleString('en-GB', {timeZone: 'UTC'})} UTC</span>
                <span className="text-[9px] text-marine-tertiary font-mono">{activeScene.platform} · {activeScene.polarization || 'N/A'}</span>
                <span className={`text-[8px] font-mono mt-1 w-max px-1 rounded border ${activeScene.provenance === 'REAL_HISTORICAL' ? 'bg-marine-green/10 border-marine-green/30 text-marine-green' : 'bg-[#F59E0B]/10 border-[#F59E0B]/30 text-[#F59E0B]'}`}>{activeScene.provenance}</span>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center text-[9px] text-marine-tertiary font-mono">NO ACTIVE SCENE IN CURRENT TIMEFRAME</div>
          )}
        </div>

        {/* Widget 2: Environmental Conditions */}
        <div className="flex-1 p-3 flex flex-col gap-1.5 min-w-[200px]">
          <div className="text-[9px] font-bold tracking-widest uppercase text-marine-tertiary">ENVIRONMENTAL CONDITIONS</div>
          <div className="flex items-center justify-around h-full mt-1 pb-1">
            <div className="flex flex-col items-center">
              <span className="text-[9px] text-marine-muted mb-1 tracking-widest">WIND</span>
              <span className="text-[11px] font-mono font-bold text-marine-text">18.6 kn</span>
              <span className="text-[9px] text-marine-tertiary font-mono">ENE</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[9px] text-marine-muted mb-1 tracking-widest">CURRENTS</span>
              <span className="text-[11px] font-mono font-bold text-marine-text">1.2 kn</span>
              <span className="text-[9px] text-marine-tertiary font-mono">NE</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[9px] text-marine-muted mb-1 tracking-widest">WAVE HT</span>
              <span className="text-[11px] font-mono font-bold text-marine-text">2.1 m</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[9px] text-marine-muted mb-1 tracking-widest">SST</span>
              <span className="text-[11px] font-mono font-bold text-marine-text">25.3 °C</span>
            </div>
          </div>
        </div>

        {/* Widget 3: Data Sources */}
        <div className="flex-1 p-3 flex flex-col gap-1.5 min-w-[200px]">
          <div className="text-[9px] font-bold tracking-widest uppercase text-marine-tertiary flex justify-between">
            <span>DATA SOURCES</span>
            <span className="text-marine-blue cursor-pointer hover:underline lowercase tracking-normal font-sans">View all sources →</span>
          </div>
          <div className="flex flex-col gap-0.5 mt-1 pb-1">
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span className="text-marine-muted flex items-center gap-1.5"><Database className="w-3 h-3"/> Sentinel-1</span>
              <span className="text-marine-green">REAL_HISTORICAL</span>
            </div>
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span className="text-marine-muted flex items-center gap-1.5"><Database className="w-3 h-3"/> Sentinel-2</span>
              <span className="text-marine-red">UNAVAILABLE</span>
            </div>
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span className="text-marine-muted flex items-center gap-1.5"><Database className="w-3 h-3"/> AIS (Live)</span>
              <span className="text-marine-green">REAL</span>
            </div>
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span className="text-marine-muted flex items-center gap-1.5"><Database className="w-3 h-3"/> HYCOM</span>
              <span className="text-marine-green">REAL_HISTORICAL</span>
            </div>
          </div>
        </div>

        {/* Widget 4: Map Overview */}
        <div className="flex-1 p-3 flex flex-col gap-1.5 min-w-[200px] relative">
          <div className="text-[9px] font-bold tracking-widest uppercase text-marine-tertiary absolute top-3 z-10 bg-[#050a0f]/80 px-1 rounded">MAP OVERVIEW</div>
          <div className="w-full h-full relative overflow-hidden bg-[#020508] border border-[#101C26] rounded flex items-center justify-center">
             {/* A placeholder representation of the global map with a viewport box */}
             <div className="absolute inset-0 bg-[url('https://upload.wikimedia.org/wikipedia/commons/e/ec/World_map_blank_without_borders.svg')] bg-contain bg-center bg-no-repeat opacity-20 invert grayscale"></div>
             <div className="w-8 h-4 border border-marine-blue bg-marine-blue/20 relative z-10 shadow-[0_0_10px_rgba(0,136,170,0.5)] translate-x-4 translate-y-2"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BottomDashboard;
