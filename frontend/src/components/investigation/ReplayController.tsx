import { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, FastForward } from 'lucide-react';

interface ReplayControllerProps {
  currentTimelineTime: number;
  setCurrentTimelineTime: React.Dispatch<React.SetStateAction<number>>;
  startTime: number;
  endTime: number;
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  onReplayComplete: () => void;
}

export default function ReplayController({ 
  currentTimelineTime, 
  setCurrentTimelineTime, 
  startTime, 
  endTime,
  isPlaying,
  setIsPlaying,
  onReplayComplete 
}: ReplayControllerProps) {
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const requestRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number | undefined>(undefined);

  const SPEEDS = [0.5, 1, 2, 5, 10];

  const animate = (time: number) => {
    if (lastTimeRef.current !== undefined) {
      const deltaTimeMs = time - lastTimeRef.current;
      // In our simulation, 1 second of real time = 10 minutes of sim time at 1x speed
      // 10 minutes = 600,000 ms.
      // So real deltaTimeMs * 600 * playbackSpeed = sim delta.
      const simDelta = deltaTimeMs * 600 * playbackSpeed;
      
      setCurrentTimelineTime(prev => {
        const nextTime = prev + simDelta;
        if (nextTime >= endTime) {
          setIsPlaying(false);
          onReplayComplete();
          return endTime;
        }
        return nextTime;
      });
    }
    lastTimeRef.current = time;
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      lastTimeRef.current = undefined;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, playbackSpeed, endTime]);

  const togglePlay = () => {
    if (currentTimelineTime >= endTime) {
      // Restart if at end
      setCurrentTimelineTime(startTime);
    }
    setIsPlaying(!isPlaying);
  };

  const restart = () => {
    setIsPlaying(false);
    setCurrentTimelineTime(startTime);
  };

  const cycleSpeed = () => {
    const nextIdx = (SPEEDS.indexOf(playbackSpeed) + 1) % SPEEDS.length;
    setPlaybackSpeed(SPEEDS[nextIdx]);
  };

  return (
    <div className="flex bg-marine-panel/95 backdrop-blur border border-marine-highlight rounded-full items-center p-1 shadow-[0_0_15px_rgba(0,229,255,0.2)]">
      <button 
        onClick={restart}
        className="p-2 text-marine-muted hover:text-white transition-colors rounded-full"
        title="Restart"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
      
      <button 
        onClick={togglePlay}
        className="p-2 bg-marine-highlight text-marine-bg hover:bg-[#00e5ff] transition-colors rounded-full mx-1 shadow-[0_0_10px_rgba(0,229,255,0.5)]"
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>
      
      <button 
        onClick={cycleSpeed}
        className="px-3 py-1 text-xs font-mono text-marine-muted hover:text-white transition-colors rounded-full flex items-center gap-1"
        title="Playback Speed"
      >
        {playbackSpeed}x <FastForward className="w-3 h-3" />
      </button>
    </div>
  );
}
