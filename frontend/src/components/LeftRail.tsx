import { useState } from 'react';
import { Globe, FileText, Ship, Layers, Wind, FileBarChart, Bell, Settings } from 'lucide-react';

interface LeftRailProps {
  dataMode: string;
  isInvestigationMode: boolean;
  onSetView: (view: string) => void;
  activeView: string;
}

interface NavItem {
  id: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'map', label: 'MAP', Icon: Globe, title: 'Map View' },
  { id: 'incidents', label: 'INCIDENTS', Icon: FileText, title: 'Incidents' },
  { id: 'vessels', label: 'VESSELS', Icon: Ship, title: 'AIS Vessels' },
  { id: 'layers', label: 'LAYERS', Icon: Layers, title: 'Layer Control' },
  { id: 'environment', label: 'ENVIRONMENT', Icon: Wind, title: 'Environment' },
  { id: 'reports', label: 'REPORTS', Icon: FileBarChart, title: 'Reports' },
  { id: 'alerts', label: 'ALERTS', Icon: Bell, title: 'Alerts' },
  { id: 'settings', label: 'SETTINGS', Icon: Settings, title: 'Settings' },
];



export default function LeftRail({ onSetView, activeView }: LeftRailProps) {
  const [tooltip, setTooltip] = useState<string | null>(null);

  return (
    <div className="w-[60px] shrink-0 bg-[#050a0f] border-r border-[#101C26] flex flex-col items-center py-4 gap-2 z-20 relative select-none">

      {/* Nav icons */}
      {NAV_ITEMS.map(({ id, label, Icon, title }) => {
        const isActive = activeView === id;
        return (
          <div
            key={id}
            className="relative w-full"
            onMouseEnter={() => setTooltip(id)}
            onMouseLeave={() => setTooltip(null)}
          >
            <button
              onClick={() => onSetView(id)}
              className={
                'w-full flex flex-col items-center gap-1.5 py-3 transition-all duration-150 border-l-2 ' +
                (isActive
                  ? 'border-l-marine-green bg-marine-green/5 text-white'
                  : 'border-l-transparent text-marine-muted hover:text-marine-text hover:bg-[#101C26]')
              }
            >
              <Icon className="w-[18px] h-[18px]" />
              <span className={`text-[7px] font-bold tracking-wider ${isActive ? 'text-marine-green' : 'text-marine-muted'}`}>
                {label}
              </span>
            </button>
            {tooltip === id && !isActive && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 pointer-events-none">
                <div className="bg-marine-panel border border-marine-border text-marine-text text-[10px] font-mono px-2 py-1 rounded whitespace-nowrap shadow-xl">
                  {title}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
