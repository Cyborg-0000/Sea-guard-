import { useMemo } from 'react';
import { Satellite, Ship, Wind, Clock, AlertTriangle, Activity } from 'lucide-react';

const TYPE_ICONS: Record<string, any> = {
  SATELLITE: <Satellite className="w-3 h-3 text-marine-highlight" />,
  AIS: <Ship className="w-3 h-3 text-[#00e5ff]" />,
  ENVIRONMENT: <Wind className="w-3 h-3 text-marine-warning" />,
  DRIFT: <Clock className="w-3 h-3 text-marine-warning" />,
  INCIDENT: <AlertTriangle className="w-3 h-3 text-marine-critical" />,
  ANALYSIS: <Activity className="w-3 h-3 text-white" />
};

interface IncidentTimelineProps {
  timeline: any[];
  currentTimelineTime: number;
  onTimeChange: (time: number) => void;
  onEventSelect: (event: any) => void;
}

export default function IncidentTimeline({ timeline, currentTimelineTime, onTimeChange, onEventSelect }: IncidentTimelineProps) {
  // Determine global min and max time bounds
  const minTime = useMemo(() => {
    if (!timeline || timeline.length === 0) return 0;
    return Math.min(...timeline.map((t: any) => new Date(t.timestamp).getTime())) - 3600000;
  }, [timeline]);
  const maxTime = useMemo(() => {
    if (!timeline || timeline.length === 0) return 0;
    return Math.max(...timeline.map((t: any) => new Date(t.timestamp).getTime())) + 3600000;
  }, [timeline]);

  if (!timeline || timeline.length === 0) return null;
  const duration = maxTime - minTime;

  // Render events spaced proportionally
  return (
    <div className="absolute bottom-0 left-0 w-full h-32 bg-marine-panel/95 backdrop-blur border-t border-marine-border flex flex-col px-6 py-2 z-20">
      <div className="flex justify-between items-end mb-2">
        <h3 className="text-xs uppercase tracking-wider text-marine-muted font-bold">Investigation Timeline</h3>
        <div className="text-sm font-mono text-white flex flex-col items-end">
          <span className="text-[9px] text-marine-muted uppercase tracking-wider">Investigation Time</span>
          <span>{new Date(currentTimelineTime).toISOString().replace('T', ' ').substring(0, 19)} UTC</span>
        </div>
      </div>
      
      <div className="relative w-full h-12 mt-2">
        {/* Progress Bar Background */}
        <div className="absolute top-4 w-full h-1 bg-marine-bg border border-marine-border rounded-full"></div>
        
        {/* Scrubber Input */}
        <input 
          type="range" 
          min={minTime} 
          max={maxTime} 
          value={currentTimelineTime} 
          onChange={(e) => onTimeChange(Number(e.target.value))}
          className="absolute top-3.5 w-full h-2 z-10 opacity-0 cursor-pointer"
        />

        {/* Custom Scrubber Thumb */}
        <div 
          className="absolute top-2 w-3 h-5 bg-[#00e5ff] rounded-sm pointer-events-none transform -translate-x-1/2 shadow-[0_0_10px_#00e5ff]"
          style={{ left: `${((currentTimelineTime - minTime) / duration) * 100}%` }}
        />

        {/* Timeline Events */}
        {timeline.map((evt) => {
          const t = new Date(evt.timestamp).getTime();
          const leftPercent = ((t - minTime) / duration) * 100;
          return (
            <div 
              key={evt.id} 
              className="absolute top-6 group cursor-pointer"
              style={{ left: `${leftPercent}%` }}
              onClick={() => onEventSelect(evt)}
            >
              <div className="w-px h-3 bg-marine-border mx-auto"></div>
              <div className="bg-marine-bg border border-marine-border rounded p-1 hover:border-[#00e5ff] transform -translate-x-1/2 flex items-center justify-center relative">
                {TYPE_ICONS[evt.type] || <Activity className="w-3 h-3 text-marine-muted"/>}
                
                {/* Tooltip */}
                <div className="absolute bottom-full mb-1 left-1/2 transform -translate-x-1/2 bg-black border border-marine-border p-2 text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-30">
                  <div className="font-bold text-white flex items-center gap-1">
                    {TYPE_ICONS[evt.type]} {evt.type}
                  </div>
                  <div className="text-marine-muted">{new Date(evt.timestamp).toISOString().substring(11, 16)} UTC</div>
                  <div className="mt-1">{evt.title}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
