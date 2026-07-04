import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { getCheckupInsights, type CheckupStop } from "@/serverfn/checkup";
import type { WebData, SimulatedNode, Position } from "@/components/web/webTypes";
import { runForceSimulation } from "@/components/web/webUtils";
import { SpiderMascot } from "./SpiderMascot";
import { InsightBubble } from "./InsightBubble";

interface Props {
  data: WebData;
  width: number;
  height: number;
  onClose: () => void;
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function CharlotteCheckup({ data, width, height, onClose }: Props) {
  const fetchInsights = useServerFn(getCheckupInsights);
  const { data: result, isLoading, error } = useQuery({
    queryKey: ["charlotte-checkup"],
    queryFn: () => fetchInsights(),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Compute layout positions for the spiderweb (independent of WebCanvas pan/zoom).
  const layout = useMemo(() => {
    const sim: SimulatedNode[] = data.nodes.map((n) => ({ ...n, x: 0, y: 0, vx: 0, vy: 0 }));
    const positions = runForceSimulation(sim, data.edges);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of positions) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const bw = (maxX - minX) + 80 || 1;
    const bh = (maxY - minY) + 80 || 1;
    const fit = Math.min(width / bw, height / bh, 1.4);
    const cx = width / 2, cy = height / 2;
    const screen = new Map<string, Position>();
    data.nodes.forEach((n, i) => {
      const p = positions[i] ?? { x: 0, y: 0 };
      screen.set(n.id, { x: cx + p.x * fit, y: cy + p.y * fit });
    });
    // Group by ring for silk threads
    const ringNodes = new Map<number, Array<{ id: string; x: number; y: number; angle: number }>>();
    data.nodes.forEach((n, i) => {
      const p = positions[i] ?? { x: 0, y: 0 };
      const sp = { x: cx + p.x * fit, y: cy + p.y * fit };
      const arr = ringNodes.get(n.ring) ?? [];
      arr.push({ id: n.id, x: sp.x, y: sp.y, angle: Math.atan2(sp.y - cy, sp.x - cx) });
      ringNodes.set(n.ring, arr);
    });
    ringNodes.forEach((arr) => arr.sort((a, b) => a.angle - b.angle));
    return { screen, ringNodes, cx, cy };
  }, [data.nodes, data.edges, width, height]);

  // Resolve a stop's nodeKey to a screen position.
  const resolveStop = (stop: CheckupStop): { x: number; y: number; resolvedId: string } | null => {
    if (layout.screen.has(stop.nodeKey)) {
      const p = layout.screen.get(stop.nodeKey)!;
      return { x: p.x, y: p.y, resolvedId: stop.nodeKey };
    }
    // workflow-/purpose- stops: fall back to user-center
    const center = layout.screen.get("user-center");
    if (center) return { x: center.x, y: center.y, resolvedId: "user-center" };
    return null;
  };

  const stops = result?.stops ?? [];
  const validStops = useMemo(
    () => stops.map((s) => ({ stop: s, resolved: resolveStop(s) })).filter((x) => x.resolved !== null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stops, layout],
  );

  const [index, setIndex] = useState(0);
  const [spider, setSpider] = useState(() => {
    // Random off-screen edge
    const edge = Math.floor(Math.random() * 4);
    if (edge === 0) return { x: Math.random() * width, y: -60, angle: 90 };
    if (edge === 1) return { x: width + 60, y: Math.random() * height, angle: 180 };
    if (edge === 2) return { x: Math.random() * width, y: height + 60, angle: 270 };
    return { x: -60, y: Math.random() * height, angle: 0 };
  });
  const [arrived, setArrived] = useState(false);
  const rafRef = useRef<number | null>(null);

  // Animate spider to current target
  useEffect(() => {
    if (!validStops.length) return;
    const cur = validStops[index]?.resolved;
    if (!cur) return;
    setArrived(false);
    if (reducedMotion()) {
      setSpider({ x: cur.x, y: cur.y - 40, angle: 0 });
      setArrived(true);
      return;
    }
    const start = { ...spider };
    const target = { x: cur.x, y: cur.y - 40 };
    const dx = target.x - start.x, dy = target.y - start.y;
    const dist = Math.hypot(dx, dy);
    const duration = Math.min(1400, 350 + dist * 1.5);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setSpider({ x: start.x + dx * eased, y: start.y + dy * eased, angle });
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else setArrived(true);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, validStops.length]);

  const handleNext = () => {
    if (index + 1 >= validStops.length) {
      // Crawl off-screen
      const edge = Math.floor(Math.random() * 4);
      const off = edge === 0 ? { x: Math.random() * width, y: -80 }
        : edge === 1 ? { x: width + 80, y: Math.random() * height }
        : edge === 2 ? { x: Math.random() * width, y: height + 80 }
        : { x: -80, y: Math.random() * height };
      setSpider({ ...off, angle: spider.angle });
      setTimeout(() => onClose(), 700);
    } else {
      setIndex((i) => i + 1);
    }
  };

  // Silk threads: connect ring-1 polygon and ring-2 polygon.
  const ring1 = layout.ringNodes.get(1) ?? [];
  const ring2 = layout.ringNodes.get(2) ?? [];

  // Radar-style concentric rings (matches FluencyRadarChart aesthetic).
  const radarMaxR = Math.min(width, height) * 0.46;
  const RING_FRACTIONS = [0.2, 0.4, 0.6, 0.8, 1.0];
  // Radial silk spokes — one per ring-1 node so the geometry maps to nodes.
  const ringForSpokes = ring1.length >= 3 ? ring1 : (ring2.length >= 3 ? ring2 : []);

  return (
    <div className="absolute inset-0 z-30">
      {/* Brand backdrop matching radar chart */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(111,250,198,0.10) 0%, rgba(140,208,255,0.06) 40%, transparent 70%), hsl(220 30% 7% / 0.55)",
          backdropFilter: "blur(2px)",
        }}
      />

      {/* Radar-style web skin */}
      <svg
        width={width} height={height}
        className="absolute inset-0 pointer-events-none"
        style={{ overflow: "visible" }}
      >
        {/* Concentric radar rings — same stroke as FluencyRadarChart */}
        {RING_FRACTIONS.map((f, i) => (
          <circle key={`ring-${i}`} cx={layout.cx} cy={layout.cy} r={radarMaxR * f}
            fill="none" stroke="#5BA8D9" strokeOpacity={0.35 + i * 0.04} strokeWidth={1.1} />
        ))}
        {/* Radial spokes from center out through each ring-1 node */}
        {ringForSpokes.map((n) => {
          const dx = n.x - layout.cx, dy = n.y - layout.cy;
          const len = Math.hypot(dx, dy) || 1;
          const ex = layout.cx + (dx / len) * radarMaxR;
          const ey = layout.cy + (dy / len) * radarMaxR;
          return (
            <line key={`spoke-${n.id}`} x1={layout.cx} y1={layout.cy} x2={ex} y2={ey}
              stroke="#5BA8D9" strokeOpacity={0.45} strokeWidth={1.1} />
          );
        })}
        {/* Silk polygon between actual ring-1 nodes for that "web at the nodes" feel */}
        {ring1.length > 2 && (
          <polygon
            points={ring1.map((n) => `${n.x},${n.y}`).join(" ")}
            fill="none" stroke="#6FFAC6" strokeOpacity={0.55} strokeWidth={1.25}
          />
        )}
        {ring2.length > 2 && (
          <polygon
            points={ring2.map((n) => `${n.x},${n.y}`).join(" ")}
            fill="none" stroke="#8CD0FF" strokeOpacity={0.3} strokeWidth={0.8} strokeDasharray="3 5"
          />
        )}
        {/* Node dots — keep tool nodes visible */}
        {data.nodes.map((n) => {
          const p = layout.screen.get(n.id);
          if (!p) return null;
          const isCenter = n.ring === 0;
          return (
            <g key={n.id}>
              <circle cx={p.x} cy={p.y} r={isCenter ? 9 : n.ring === 1 ? 6 : 3.5}
                fill={n.color ?? "#8CD0FF"} stroke="#0c2340" strokeWidth={1.5} />
              {n.ring <= 1 && (
                <text x={p.x} y={p.y + (isCenter ? 24 : 18)} textAnchor="middle"
                  fontSize={isCenter ? 12 : 10} fontWeight={700}
                  fill="#e8f0f8" style={{ paintOrder: "stroke", stroke: "#0c2340", strokeWidth: 3 }}>
                  {n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Beta header strip */}
      <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-5 py-3 bg-gradient-to-b from-[hsl(220_30%_7%)]/90 to-transparent">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tracking-tight text-[#e8f0f8]">Charlotte's Tour</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#6FFAC6] text-[#0c2340]">
            Beta
          </span>
        </div>
        <button
          type="button" onClick={onClose}
          className="p-2 rounded-full bg-card/90 border shadow hover:bg-accent"
          aria-label="Close tour"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-40">
          <div className="rounded-xl bg-card border px-4 py-3 shadow-lg flex items-center gap-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Charlotte is reading your threads…
          </div>
        </div>
      )}

      {/* Error fallback */}
      {error && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-40">
          <div className="rounded-xl bg-card border px-4 py-3 shadow-lg text-sm">
            Charlotte is napping — try again in a minute.
          </div>
        </div>
      )}

      {/* Spider */}
      {!isLoading && validStops.length > 0 && (
        <SpiderMascot x={spider.x} y={spider.y} angle={spider.angle} />
      )}

      {/* Bubble */}
      {!isLoading && arrived && validStops[index] && (
        <InsightBubble
          x={spider.x}
          y={spider.y}
          title={validStops[index].stop.title}
          insight={validStops[index].stop.insight}
          index={index}
          total={validStops.length}
          onNext={handleNext}
          onSkip={onClose}
        />
      )}
    </div>
  );
}
