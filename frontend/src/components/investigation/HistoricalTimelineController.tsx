import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface HistoricalTimelineControllerProps {
  timeline: any[];
  currentTimelineTime: number;
  setCurrentTimelineTime: (t: number) => void;
  onEventSelect?: (evt: any) => void;
  orchestratorStep?: string;
  verdict?: any;
}

export default function HistoricalTimelineController({
  timeline,
  currentTimelineTime,
  setCurrentTimelineTime,
  onEventSelect,
  orchestratorStep,
  verdict,
}: HistoricalTimelineControllerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const SPEEDS = [0.5, 1, 2, 4];
  const timerRef = useRef<number | null>(null);

  // Auto-play logic
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      return;
    }
    
    // In story mode, play means jump to next event every N seconds
    const intervalMs = 2000 / SPEEDS[speedIdx];
    
    timerRef.current = window.setInterval(() => {
      // Find current event index
      const sortedEvents = [...timeline].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      let nextEvt = null;
      for (const evt of sortedEvents) {
        if (new Date(evt.timestamp).getTime() > currentTimelineTime) {
          nextEvt = evt;
          break;
        }
      }
      
      if (nextEvt) {
        setCurrentTimelineTime(new Date(nextEvt.timestamp).getTime());
        if (onEventSelect) onEventSelect(nextEvt);
      } else {
        setIsPlaying(false); // Reached the end
      }
    }, intervalMs);
    
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [isPlaying, speedIdx, currentTimelineTime, timeline]);

  const sortedEvents = [...timeline].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const handleNext = () => {
    for (const evt of sortedEvents) {
      if (new Date(evt.timestamp).getTime() > currentTimelineTime) {
        setCurrentTimelineTime(new Date(evt.timestamp).getTime());
        if (onEventSelect) onEventSelect(evt);
        return;
      }
    }
  };

  const handlePrev = () => {
    for (let i = sortedEvents.length - 1; i >= 0; i--) {
      if (new Date(sortedEvents[i].timestamp).getTime() < currentTimelineTime) {
        setCurrentTimelineTime(new Date(sortedEvents[i].timestamp).getTime());
        if (onEventSelect) onEventSelect(sortedEvents[i]);
        return;
      }
    }
  };

  return (
    <div className="absolute bottom-0 left-0 w-full h-48 bg-marine-bg border-t border-marine-border flex px-6 py-4 z-20 font-sans shadow-2xl text-marine-text">
      {/* Left side: Timeline list */}
      <div className="flex-1 flex flex-col pr-8 border-r border-marine-border overflow-y-auto">
        <h3 className="text-xs font-bold tracking-widest text-marine-muted uppercase mb-2 sticky top-0 bg-marine-bg flex items-center justify-between">
          <span>WAKASHIO INCIDENT — AUG 2020</span>
          {verdict?.status === 'BLOCKED' && (
            <span className="text-[8px] font-mono text-marine-red border border-marine-red/30 bg-marine-red/10 px-1.5 py-0.5 rounded">ATTRIBUTION BLOCKED</span>
          )}
          {(!orchestratorStep || orchestratorStep === 'IDLE') && (
            <span className="text-[8px] font-mono text-marine-blue border border-marine-blue/30 bg-marine-blue/10 px-1.5 py-0.5 rounded">RUN SCAN TO CORRELATE</span>
          )}
        </h3>
        
        <div className="flex flex-col gap-0 relative ml-4">
          <div className="absolute top-2 bottom-2 left-1.5 w-0.5 bg-marine-border"></div>
          {sortedEvents.map((evt) => {
            const evtTime = new Date(evt.timestamp).getTime();
            const isActive = evtTime === currentTimelineTime;
            const isPast = evtTime < currentTimelineTime;
            
            return (
              <div 
                key={evt.id} 
                onClick={() => {
                  setCurrentTimelineTime(evtTime);
                  if (onEventSelect) onEventSelect(evt);
                  setIsPlaying(false);
                }}
                className={`relative flex items-center gap-4 py-2 cursor-pointer transition-all group ${isActive ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
              >
                {/* Node dot */}
                <div className={`w-3.5 h-3.5 rounded-full z-10 transition-colors border ${
                  isActive ? 'bg-marine-blue border-marine-blue' : 
                  isPast ? 'bg-marine-panel border-marine-tertiary' : 'bg-marine-panel border-marine-border'
                }`} />
                
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${isActive ? 'text-marine-blue' : 'text-marine-text'}`}>
                      {evt.title}
                    </span>
                    <span className="text-[8px] font-mono text-marine-muted uppercase px-1.5 py-0.5 border border-marine-border rounded bg-marine-panel">
                      {evt.event_type}
                    </span>
                  </div>
                  <span className="text-[10px] text-marine-muted mt-0.5">{evt.description}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Right side: Controls */}
      <div className="w-64 flex flex-col items-center justify-center gap-4 pl-8">
        <div className="text-[10px] font-mono text-marine-blue uppercase tracking-widest bg-marine-blue/10 px-3 py-1 rounded border border-marine-blue/30">
          INVESTIGATION TIME MACHINE
        </div>
        
        <div className="flex items-center gap-4">
          <button onClick={handlePrev} className="p-2 text-marine-muted hover:text-white hover:bg-marine-panel rounded transition-colors">
            <SkipBack className="w-4 h-4" />
          </button>
          
          <button 
            onClick={() => setIsPlaying(!isPlaying)} 
            className="w-12 h-12 flex items-center justify-center rounded-full bg-marine-blue text-marine-bg hover:scale-105 transition-all"
          >
            {isPlaying ? <Pause className="w-6 h-6 ml-0.5" /> : <Play className="w-6 h-6 ml-1" />}
          </button>
          
          <button onClick={handleNext} className="p-2 text-marine-muted hover:text-white hover:bg-marine-panel rounded transition-colors">
            <SkipForward className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex gap-2">
          {SPEEDS.map((s, i) => (
            <button
              key={s}
              onClick={() => setSpeedIdx(i)}
              className={`text-[10px] font-mono px-2 py-1 rounded border transition-all ${
                speedIdx === i ? 'border-marine-blue bg-marine-blue/20 text-marine-blue' : 'border-marine-border text-marine-muted hover:border-marine-tertiary'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
