import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import type { WebData, SimulatedNode, Position, WebNode as WebNodeType, ColorByMode, BgMode } from './webTypes';
import { runForceSimulation, getConnectedIds } from './webUtils';
import { WebNode } from './WebNode';
import { WebEdge } from './WebEdge';

interface HoverInfo { node: WebNodeType; screenX: number; screenY: number; }

interface WebCanvasProps {
  data: WebData;
  onNodeClick: (nodeId: string) => void;
  width: number;
  height: number;
  colorBy: ColorByMode;
  bgMode?: BgMode;
  pinnedId?: string | null;
}

export function WebCanvas({ data, onNodeClick, width, height, colorBy, bgMode = 'dark', pinnedId = null }: WebCanvasProps) {
  const isDark = bgMode === 'dark';
  const isBlueprint = bgMode === 'blueprint';
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number | null>(null);

  const dataKey = `${data.nodes.length}-${data.edges.length}`;
  useEffect(() => { setPan({ x: 0, y: 0 }); setZoom(null); }, [dataKey]);

  const lastMouse = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const positions = useMemo<Position[]>(() => {
    const simNodes: SimulatedNode[] = data.nodes.map((n) => ({ ...n, x: 0, y: 0, vx: 0, vy: 0 }));
    return runForceSimulation(simNodes, data.edges);
  }, [data.nodes, data.edges]);

  const autoZoom = useMemo(() => {
    if (positions.length === 0) return 1;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of positions) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const bw = (maxX - minX) + 60 || 1;
    const bh = (maxY - minY) + 60 || 1;
    const fitZoom = Math.min((width * 0.85) / bw, (height * 0.85) / bh, 1.5);
    return Math.max(0.3, Math.min(1.5, fitZoom));
  }, [positions, width, height]);

  const posMap = useMemo(() => {
    const m = new Map<string, Position>();
    let centerX = 0, centerY = 0;
    data.nodes.forEach((n, i) => {
      if (n.ring === 0) { const pos = positions[i] ?? { x: 0, y: 0 }; centerX = pos.x; centerY = pos.y; }
    });
    data.nodes.forEach((n, i) => {
      const pos = positions[i] ?? { x: 0, y: 0 };
      m.set(n.id, { x: pos.x - centerX, y: pos.y - centerY });
    });
    return m;
  }, [data.nodes, positions]);

  const adjustedPosMap = useMemo(() => {
    if (!hoveredId) return posMap;
    const hoveredPos = posMap.get(hoveredId);
    if (!hoveredPos) return posMap;
    const repulsionRadius = 80, strength = 30;
    const adjusted = new Map<string, Position>();
    posMap.forEach((pos, id) => {
      if (id === hoveredId) { adjusted.set(id, pos); return; }
      const dx = pos.x - hoveredPos.x, dy = pos.y - hoveredPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < repulsionRadius && dist > 0) {
        const factor = (repulsionRadius - dist) / repulsionRadius;
        adjusted.set(id, { x: pos.x + (dx / dist) * strength * factor, y: pos.y + (dy / dist) * strength * factor });
      } else adjusted.set(id, pos);
    });
    return adjusted;
  }, [hoveredId, posMap]);

  const activeId = hoveredId ?? pinnedId;
  const highlightedIds = useMemo(() => activeId ? getConnectedIds(activeId, data.edges) : null, [activeId, data.edges]);

  const handleHover = useCallback((id: string | null, screenPos?: { x: number; y: number }) => {
    setHoveredId(id);
    if (id && screenPos) {
      const node = data.nodes.find(n => n.id === id);
      if (node) {
        const rect = containerRef.current?.getBoundingClientRect();
        const rx = rect ? screenPos.x - rect.left : screenPos.x;
        const ry = rect ? screenPos.y - rect.top : screenPos.y;
        setHoverInfo({ node, screenX: rx, screenY: ry });
      }
    } else setHoverInfo(null);
  }, [data.nodes]);

  const didDrag = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const effectiveZoom = zoom ?? autoZoom;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    didDrag.current = false;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    const startPos = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
    const handleMove = (moveE: PointerEvent) => {
      moveE.preventDefault();
      const dx = moveE.clientX - startPos.x, dy = moveE.clientY - startPos.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
      const deltaX = moveE.clientX - lastMouse.current.x;
      const deltaY = moveE.clientY - lastMouse.current.y;
      lastMouse.current = { x: moveE.clientX, y: moveE.clientY };
      setPan((p) => ({ x: p.x + deltaX, y: p.y + deltaY }));
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      setIsDragging(false);
      setTimeout(() => { didDrag.current = false; }, 0);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, []);

  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.max(0.3, Math.min(3, (z ?? autoZoom) - e.deltaY * 0.001)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [autoZoom]);

  const cx = width / 2, cy = height / 2;
  const bgColor = isBlueprint ? 'transparent' : isDark ? 'hsl(220 30% 7%)' : 'hsl(220 20% 95%)';
  const ringStroke = isBlueprint ? 'hsl(200 40% 20%)' : isDark ? 'hsl(220 30% 15%)' : 'hsl(220 20% 80%)';

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <svg
        ref={svgRef} width={width} height={height} className="select-none" overflow="visible"
        style={{ background: bgColor, cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        onPointerDown={onPointerDown}
      >
        <g transform={`translate(${cx + pan.x}, ${cy + pan.y}) scale(${effectiveZoom})`}>
          {isBlueprint
            ? [120, 240, 340].map((r) => (
                <rect key={r} x={-r} y={-r} width={r * 2} height={r * 2} fill="none" stroke={ringStroke} strokeWidth={0.5} strokeDasharray="6 10" opacity={0.4} />
              ))
            : [120, 240, 340].map((r) => (
                <circle key={r} cx={0} cy={0} r={r} fill="none" stroke={ringStroke} strokeWidth={0.5} strokeDasharray="4 8" opacity={0.5} />
              ))}
          {data.edges.map((edge) => {
            const sp = adjustedPosMap.get(edge.source);
            const tp = adjustedPosMap.get(edge.target);
            if (!sp || !tp) return null;
            const hl = highlightedIds ? highlightedIds.has(edge.source) && highlightedIds.has(edge.target) : false;
            const dim = highlightedIds ? !hl : false;
            return <WebEdge key={edge.id} edge={edge} sourcePos={sp} targetPos={tp} highlighted={hl} dimmed={dim} bgMode={bgMode} />;
          })}
          {data.nodes.map((node) => {
            const pos = adjustedPosMap.get(node.id);
            if (!pos) return null;
            const hl = highlightedIds ? highlightedIds.has(node.id) : false;
            const dim = highlightedIds ? !highlightedIds.has(node.id) : false;
            return <WebNode key={node.id} node={node} pos={pos} highlighted={hl} dimmed={dim} onHover={handleHover} onClick={(id) => { if (!didDrag.current) onNodeClick(id); }} bgMode={bgMode} />;
          })}
        </g>
      </svg>

      {hoverInfo && (
        <div className="absolute z-50 pointer-events-none"
          style={{ left: hoverInfo.screenX, top: hoverInfo.screenY - 12, transform: 'translate(-50%, -100%)' }}>
          <div className={`border px-3 py-2.5 shadow-xl min-w-[160px] max-w-[240px] ${
            isBlueprint ? 'rounded-none border-[hsl(200_40%_30%)] bg-[hsl(220_30%_9%)] font-mono'
              : isDark ? 'rounded-lg border-[hsl(220_30%_25%)] bg-[hsl(220_30%_12%)]'
              : 'rounded-lg border-[hsl(220_20%_80%)] bg-white'
          }`}>
            <p className={`text-sm font-semibold truncate ${
              isBlueprint ? 'text-[hsl(200_60%_70%)] uppercase tracking-wider text-xs' : isDark ? 'text-[hsl(220_20%_90%)]' : 'text-[hsl(220_20%_20%)]'
            }`}>{hoverInfo.node.label}</p>
            <p className={`text-[10px] capitalize mt-0.5 ${
              isBlueprint ? 'text-[hsl(200_40%_45%)] uppercase tracking-wide' : isDark ? 'text-[hsl(220_20%_55%)]' : 'text-[hsl(220_20%_45%)]'
            }`}>{hoverInfo.node.type.replace('_', ' ')}</p>
            {hoverInfo.node.metrics?.interactionCount != null && (
              <p className={`text-[10px] mt-1 ${
                isBlueprint ? 'text-[hsl(200_40%_45%)] tracking-wide' : isDark ? 'text-[hsl(220_20%_55%)]' : 'text-[hsl(220_20%_50%)]'
              }`}>{hoverInfo.node.metrics.interactionCount} interactions</p>
            )}
            {colorBy && hoverInfo.node.metadata?.colorByValue ? (
              <p className={`text-[9px] capitalize mt-1 ${isBlueprint ? 'text-[hsl(200_30%_40%)]' : 'text-[hsl(220_20%_45%)]'}`}>
                {String(hoverInfo.node.metadata.colorByValue)}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
