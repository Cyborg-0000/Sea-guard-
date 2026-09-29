import { useMemo } from 'react';
import { Satellite, Ship, AlertTriangle, Wind, Clock, Target, Activity } from 'lucide-react';

const NODE_ICONS: Record<string, any> = {
  satellite: <Satellite className="w-4 h-4 text-marine-highlight" />,
  spill: <AlertTriangle className="w-4 h-4 text-marine-critical" />,
  environment: <Wind className="w-4 h-4 text-marine-warning" />,
  drift: <Clock className="w-4 h-4 text-marine-warning" />,
  corridor: <Target className="w-4 h-4 text-marine-warning" />,
  vessel: <Ship className="w-4 h-4 text-white" />,
  ais: <Activity className="w-4 h-4 text-[#00e5ff]" />,
  attribution: <Activity className="w-4 h-4 text-[#00e5ff]" />
};

// Map node types to the replay layer state that must be active for that node to appear
const NODE_REVEAL_MAP: Record<string, string> = {
  satellite: 'showSatellite',
  spill: 'showSpill',
  environment: 'showEnvironment',
  drift: 'showCorridor',
  corridor: 'showCorridor',
  vessel: 'showAIS',
  ais: 'showAIS',
  attribution: 'showAttribution',
};

interface EvidenceGraphProps {
  nodes: any[];
  edges: any[];
  selectedNodeId: string | null;
  onNodeSelect: (node: any) => void;
  replayLayerStates: Record<string, boolean>;
}

const EdgeLabel = ({ text }: { text: string }) => (
  <div className="flex flex-col items-center my-1 z-0 relative">
    <div className="w-px h-4 bg-marine-border"></div>
    <span className="text-[9px] uppercase tracking-wider text-marine-muted bg-marine-panel px-2 border border-marine-border rounded-full z-10">
      {text}
    </span>
    <div className="w-px h-4 bg-marine-border"></div>
    <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-marine-border absolute bottom-0 translate-y-1"></div>
  </div>
);

export default function EvidenceGraph({ nodes, edges, selectedNodeId, onNodeSelect, replayLayerStates }: EvidenceGraphProps) {
  // Filter visible nodes based on replay layer states
  const visibleNodes = useMemo(() => {
    if (!nodes || !replayLayerStates) return nodes || [];
    return nodes.filter((n: any) => {
      const stateKey = NODE_REVEAL_MAP[n.type?.toLowerCase()];
      if (!stateKey) return true;
      return replayLayerStates[stateKey] === true;
    });
  }, [nodes, replayLayerStates]);

  if (!nodes || nodes.length === 0) return null;

  const visibleNodeIds = new Set(visibleNodes.map((n: any) => n.id));

  const getNodesByType = (type: string) => visibleNodes.filter((n: any) => n.type?.toLowerCase() === type.toLowerCase());

  const satelliteNodes = getNodesByType('satellite');
  const spillNodes = getNodesByType('spill');
  const envNodes = getNodesByType('environment');
  const driftNodes = getNodesByType('drift');
  const corridorNodes = getNodesByType('corridor');
  const vesselNodes = getNodesByType('vessel');

  const NodeComponent = ({ node }: { node: any }) => {
    const isSelected = selectedNodeId === node.id;
    return (
      <div
        onClick={() => onNodeSelect(node)}
        className={`relative z-10 flex items-center gap-2 px-3 py-2 text-xs border rounded cursor-pointer transition-all duration-300
          ${isSelected
            ? 'bg-[#0088aa]/20 border-[#00e5ff] text-white shadow-[0_0_10px_rgba(0,229,255,0.2)]'
            : 'bg-marine-bg border-marine-border text-marine-text hover:border-marine-highlight'}
        `}
      >
        {NODE_ICONS[node.type?.toLowerCase()]}
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-bold uppercase tracking-wider text-[9px] text-marine-muted">{node.type}</span>
            {node.data?.provenance && (
              <span className={`text-[7px] font-mono px-1 py-0.5 rounded border ${node.data.provenance === 'REAL_HISTORICAL' ? 'bg-marine-green/10 text-marine-green border-marine-green/30' : node.data.provenance === 'SIMULATED_HISTORICAL' ? 'bg-marine-purple/10 text-marine-purple border-marine-purple/30' : 'bg-marine-tertiary/10 text-marine-tertiary border-marine-tertiary/30'}`}>
                {node.data.provenance}
              </span>
            )}
          </div>
          <span className="whitespace-nowrap">{node.title}</span>
        </div>
      </div>
    );
  };



  return (
    <div className="w-full flex flex-col items-center overflow-y-auto p-4 custom-scrollbar h-full">

      {satelliteNodes.map((n: any) => <NodeComponent key={n.id} node={n} />)}
      {satelliteNodes.length > 0 && spillNodes.length > 0 && <EdgeLabel text="detected" />}

      {spillNodes.map((n: any) => <NodeComponent key={n.id} node={n} />)}

      {spillNodes.length > 0 && (driftNodes.length > 0 || envNodes.length > 0) && <EdgeLabel text="drifted for ~5h" />}

      <div className="flex gap-4 items-start">
        {envNodes.map((n: any) => <NodeComponent key={n.id} node={n} />)}
        {driftNodes.map((n: any) => <NodeComponent key={n.id} node={n} />)}
      </div>

      {(driftNodes.length > 0 || envNodes.length > 0) && corridorNodes.length > 0 && <EdgeLabel text="derived from" />}
      {corridorNodes.map((n: any) => <NodeComponent key={n.id} node={n} />)}

      {corridorNodes.length > 0 && vesselNodes.length > 0 && <EdgeLabel text="intersected by" />}
      <div className="flex flex-col gap-4 w-full">
        {vesselNodes.map((vNode: any) => {
          const attrEdge = edges.find((e: any) => e.source_id === vNode.id && visibleNodeIds.has(e.target_id));
          const attrNode = attrEdge ? visibleNodes.find((n: any) => n.id === attrEdge.target_id && n.type === 'attribution') : null;

          return (
            <div key={vNode.id} className="flex flex-col items-center bg-marine-bg/50 border border-marine-border/50 p-3 rounded transition-all duration-500">
              <NodeComponent node={vNode} />
              <EdgeLabel text="supported by" />
              <div
                className="bg-marine-bg border border-marine-border border-dashed text-marine-muted px-3 py-1 rounded text-[10px] uppercase cursor-pointer hover:border-[#00e5ff]"
                onClick={() => onNodeSelect({ id: vNode.id + '_ais', type: 'ais', title: 'AIS History', data: {} })}
              >
                AIS Observations
              </div>
              {attrNode && (
                <>
                  <EdgeLabel text="contributes to" />
                  <NodeComponent node={attrNode} />
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state — before any events have fired */}
      {visibleNodes.length === 0 && (
        <div className="text-marine-muted text-xs text-center mt-8 px-4">
          <div className="text-2xl mb-2">○</div>
          Evidence accumulates as the incident unfolds.
          <br />Press <strong>▶ PLAY</strong> to begin.
        </div>
      )}
    </div>
  );
}
