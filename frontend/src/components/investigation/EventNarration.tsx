import { useMemo } from 'react';
import { Activity } from 'lucide-react';

export default function EventNarration({ timeline, currentTimelineTime }: { timeline: any[], currentTimelineTime: number }) {
  // Find the most recent event
  const currentEventIndex = useMemo(() => {
    if (!timeline || timeline.length === 0) return -1;
    let lastIdx = -1;
    for (let i = 0; i < timeline.length; i++) {
      if (new Date(timeline[i].timestamp).getTime() <= currentTimelineTime) {
        lastIdx = i;
      } else {
        break;
      }
    }
    return lastIdx;
  }, [timeline, currentTimelineTime]);

  if (!timeline || timeline.length === 0) return null;

  if (currentEventIndex === -1) return null;

  const currentEvent = timeline[currentEventIndex];

  return (
    <div className="absolute top-16 left-6 w-72 bg-marine-panel/90 backdrop-blur border border-marine-border rounded shadow-2xl z-20 overflow-hidden transform transition-all duration-300">
      <div className="bg-[#00e5ff]/10 border-b border-marine-border px-4 py-2 flex justify-between items-center">
        <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-[#00e5ff]">
          <Activity className="w-3 h-3 animate-pulse" />
          LIVE ANALYSIS
        </div>
        <div className="text-[10px] text-marine-muted font-mono">
          {new Date(currentEvent.timestamp).toISOString().substring(11, 16)} UTC
        </div>
      </div>
      
      <div className="p-4 flex flex-col gap-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wide leading-tight">
          {currentEvent.title}
        </h3>
        <p className="text-xs text-marine-text font-mono border-l-2 border-marine-highlight pl-2 py-1 bg-marine-bg/50">
          {currentEvent.description}
        </p>
      </div>

      {/* Progress Bar relative to total events */}
      <div className="bg-marine-bg px-4 py-2 border-t border-marine-border flex justify-between items-center">
        <span className="text-[9px] text-marine-muted font-mono">
          Event {currentEventIndex + 1} / {timeline.length}
        </span>
        <div className="flex gap-0.5">
          {timeline.map((_: any, i: number) => (
             <div 
               key={i} 
               className={`w-2 h-1 rounded-sm ${i <= currentEventIndex ? 'bg-[#00e5ff]' : 'bg-marine-border'}`}
             ></div>
          ))}
        </div>
      </div>
    </div>
  );
}
