import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, Legend } from "recharts";
import { useId, useRef, useState, useEffect, useCallback } from "react";
import charlotteMascot from "@/assets/charlotte-mascot.png";

export interface RadarDimension {
  label: string;
  value: number | null;
}

export interface RadarSeries {
  label: string;
  dimensions: RadarDimension[];
  color?: string;
  /** Render this series with a dashed stroke (used for "prior" overlay). */
  dashed?: boolean;
  /** Fill opacity override; defaults based on series count. */
  fillOpacity?: number;
}

interface FluencyRadarChartProps {
  dimensions?: RadarDimension[];
  series?: RadarSeries[];
  size?: number;
  compact?: boolean;
  color?: string;
  confidenceByLabel?: Record<string, number>; // display_name → 0.0–1.0
  /** Suppress the built-in Legend so plot area stays consistent across series counts. */
  hideLegend?: boolean;
}

const BRAND_PALETTE = [
  { stroke: "#6FFAC6", gradientFrom: "#6FFAC6", gradientTo: "#8CD0FF" },
  { stroke: "#8CD0FF", gradientFrom: "#8CD0FF", gradientTo: "#45C7FF" },
  { stroke: "#3DF37A", gradientFrom: "#3DF37A", gradientTo: "#6FFAC6" },
  { stroke: "#45C7FF", gradientFrom: "#45C7FF", gradientTo: "#8CD0FF" },
];

const RING_FRACTIONS = [0.2, 0.4, 0.6, 0.8, 1.0];

interface GridPoint { axis: number; ring: number; x: number; y: number; }

export function FluencyRadarChart({
  dimensions,
  series,
  size,
  compact = false,
  color,
  confidenceByLabel,
  hideLegend = false,
}: FluencyRadarChartProps) {
  const uid = useId().replace(/:/g, "");

  const allSeries: RadarSeries[] = series
    ? series
    : dimensions
      ? [{ label: "Score", dimensions, color }]
      : [];

  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [spider, setSpider] = useState<GridPoint | null>(null);
  const [spiderAngle, setSpiderAngle] = useState(0);
  const [hovering, setHovering] = useState(false);
  const lastMoveRef = useRef(0);
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const prevSpiderRef = useRef<GridPoint | null>(null);
  const reducedMotion = useRef(false);

  const numAxes = allSeries[0]?.dimensions.length ?? 0;

  // Track container size
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      setDims({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    reducedMotion.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    return () => ro.disconnect();
  }, []);

  // Compute geometry
  const cx = dims.w / 2;
  const cy = dims.h / 2;
  const labelInset = Math.max(compact ? 44 : 82, Math.min(compact ? 56 : 116, dims.w * (compact ? 0.1 : 0.115)));
  const labelVerticalInset = Math.max(compact ? 16 : 28, Math.min(compact ? 28 : 48, dims.h * 0.055));
  const outerFrac = compact ? 0.94 : 0.96;
  const marginX = labelInset;
  const marginY = labelVerticalInset;
  const innerW = Math.max(0, dims.w - marginX * 2);
  const innerH = Math.max(0, dims.h - marginY * 2);
  const maxR = (Math.min(innerW, innerH) / 2) * outerFrac;

  const pointAt = useCallback((axis: number, ring: number): GridPoint => {
    if (ring < 0) return { axis, ring: -1, x: cx, y: cy };
    const angle = (-90 + (axis * 360) / Math.max(numAxes, 1)) * (Math.PI / 180);
    const r = RING_FRACTIONS[ring] * maxR;
    return { axis, ring, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }, [cx, cy, maxR, numAxes]);

  // Init spider position once geometry exists
  useEffect(() => {
    if (numAxes === 0 || maxR <= 0) return;
    if (!spider) {
      setSpider(pointAt(0, RING_FRACTIONS.length - 1));
    }
  }, [numAxes, maxR, spider, pointAt]);

  const [jiggling, setJiggling] = useState(false);

  const moveSpider = useCallback(() => {
    if (!spider || !cursorRef.current || numAxes === 0 || reducedMotion.current) return;
    const cur = cursorRef.current;
    const distFromSpider = Math.hypot(spider.x - cur.x, spider.y - cur.y);
    if (distFromSpider > 110) return; // only react when cursor is very close

    const now = performance.now();
    if (now - lastMoveRef.current < 180) return;
    lastMoveRef.current = now;

    const neighbors: GridPoint[] = [];
    const lastRing = RING_FRACTIONS.length - 1;

    if (spider.ring === -1) {
      for (let a = 0; a < numAxes; a++) neighbors.push(pointAt(a, 0));
    } else {
      if (spider.ring > 0) neighbors.push(pointAt(spider.axis, spider.ring - 1));
      else neighbors.push(pointAt(spider.axis, -1));
      if (spider.ring < lastRing) neighbors.push(pointAt(spider.axis, spider.ring + 1));
      neighbors.push(pointAt((spider.axis + 1) % numAxes, spider.ring));
      neighbors.push(pointAt((spider.axis - 1 + numAxes) % numAxes, spider.ring));
    }

    // Pick among neighbors that move away from the cursor, weighted to favor
    // inner rings so Charlotte actually dives toward the center and back out.
    const ax = spider.x - cur.x;
    const ay = spider.y - cur.y;
    const prev = prevSpiderRef.current;
    const sameNode = (a: GridPoint, b: GridPoint | null) => !!b && a.axis === b.axis && a.ring === b.ring;

    const escapes = neighbors.filter(n => {
      const score = (n.x - spider.x) * ax + (n.y - spider.y) * ay;
      return score > 0;
    });
    let pool = escapes.length ? escapes : neighbors;
    if (pool.length > 1) {
      const filtered = pool.filter(n => !sameNode(n, prev));
      if (filtered.length) pool = filtered;
    }
    // Weighted pick: inner rings get higher weight (center hub heaviest).
    // ring -1 (hub) → 5, ring 0 → 4, ring 1 → 3, ring 2 → 2, outer rings → 1.
    const weightFor = (n: GridPoint) => {
      if (n.ring === -1) return 5;
      return Math.max(1, 4 - n.ring);
    };
    const weights = pool.map(weightFor);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let best = pool[0];
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) { best = pool[i]; break; }
    }

    const dx = best.x - spider.x;
    const dy = best.y - spider.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.1) {
      setSpiderAngle(Math.atan2(dy, dx) * (180 / Math.PI) + 90);
    }
    prevSpiderRef.current = spider;
    setSpider(best);
  }, [spider, numAxes, pointAt]);

  // Autonomous roam: when the user isn't interacting, hop to a random
  // neighbor every 2 seconds so Charlotte feels alive.
  useEffect(() => {
    if (reducedMotion.current) return;
    if (numAxes === 0 || maxR <= 0) return;
    const id = window.setInterval(() => {
      if (hovering) return;
      setSpider(prev => {
        if (!prev) return prev;
        const lastRing = RING_FRACTIONS.length - 1;
        const neighbors: GridPoint[] = [];
        if (prev.ring === -1) {
          for (let a = 0; a < numAxes; a++) neighbors.push(pointAt(a, 0));
        } else {
          if (prev.ring > 0) neighbors.push(pointAt(prev.axis, prev.ring - 1));
          else neighbors.push(pointAt(prev.axis, -1));
          if (prev.ring < lastRing) neighbors.push(pointAt(prev.axis, prev.ring + 1));
          neighbors.push(pointAt((prev.axis + 1) % numAxes, prev.ring));
          neighbors.push(pointAt((prev.axis - 1 + numAxes) % numAxes, prev.ring));
        }
        const prevPrev = prevSpiderRef.current;
        let pool = neighbors;
        if (pool.length > 1 && prevPrev) {
          const filtered = pool.filter(n => !(n.axis === prevPrev.axis && n.ring === prevPrev.ring));
          if (filtered.length) pool = filtered;
        }
        const next = pool[Math.floor(Math.random() * pool.length)];
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        if (Math.abs(dx) + Math.abs(dy) > 0.1) {
          setSpiderAngle(Math.atan2(dy, dx) * (180 / Math.PI) + 90);
        }
        prevSpiderRef.current = prev;
        return next;
      });
    }, 2000);
    return () => window.clearInterval(id);
  }, [hovering, numAxes, maxR, pointAt]);

  // Attention-grabber: jiggle 5s after mount, then every 15s
  useEffect(() => {
    if (reducedMotion.current) return;
    const doJiggle = () => {
      setJiggling(true);
      window.setTimeout(() => setJiggling(false), 1400);
    };
    const t = window.setTimeout(() => {
      doJiggle();
      const i = window.setInterval(doJiggle, 15000);
      (t as unknown as { _i?: number })._i = i;
    }, 5000);
    return () => {
      window.clearTimeout(t);
      const i = (t as unknown as { _i?: number })._i;
      if (i) window.clearInterval(i);
    };
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    cursorRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setHovering(true);
    moveSpider();
  };

  const handleMouseLeave = () => {
    setHovering(false);
    cursorRef.current = null;
  };

  if (allSeries.length === 0 || allSeries[0].dimensions.length === 0) return null;

  const labels = allSeries[0].dimensions.map(d => d.label);
  const data = labels.map((label, i) => {
    const point: Record<string, string | number | null> = { dimension: label };
    // Pass null through so Recharts gaps the polygon on unmeasured dimensions
    // instead of collapsing to a fake 0/midline. Defensibility > shape.
    allSeries.forEach((s, si) => {
      const v = s.dimensions[i]?.value;
      point[`s${si}`] = typeof v === "number" ? v : null;
    });
    return point;
  });

  const lowConfidenceAxes: number[] = confidenceByLabel
    ? labels.reduce<number[]>((acc, label, i) => {
        const conf = confidenceByLabel[label] ?? 1.0;
        if (conf < 0.50) acc.push(i);
        return acc;
      }, [])
    : [];

  const tickFontSize = compact ? 9 : dims.w < 520 ? 11 : 12;
  const showLegend = !compact && !hideLegend && allSeries.length > 1;
  const isMulti = allSeries.length > 1;
  const spiderSize = compact ? 28 : 42;

  const containerStyle: React.CSSProperties = size
    ? { width: size, height: size, position: "relative", overflow: "visible" }
    : { width: "100%", height: "100%", minHeight: compact ? 260 : 480, position: "relative", overflow: "visible" };

  const backdropStyle: React.CSSProperties = {
    position: "absolute", inset: 0,
    background: "radial-gradient(circle at 50% 50%, rgba(111,250,198,0.10) 0%, rgba(140,208,255,0.06) 40%, transparent 70%)",
    pointerEvents: "none", borderRadius: "50%",
  };

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <style>{`
        @keyframes charlotte-web-shake-${uid} {
          0%, 100% { transform: translate(0,0) rotate(0deg); }
          25% { transform: translate(-0.4px, 0.3px) rotate(-0.12deg); }
          50% { transform: translate(0.3px, -0.4px) rotate(0.1deg); }
          75% { transform: translate(0.4px, 0.2px) rotate(0.13deg); }
        }
        @keyframes charlotte-idle-${uid} {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes charlotte-jiggle-${uid} {
          0%, 100% { transform: rotate(0deg) scale(1); }
          15% { transform: rotate(-14deg) scale(1.15); }
          30% { transform: rotate(12deg) scale(1.15); }
          45% { transform: rotate(-10deg) scale(1.12); }
          60% { transform: rotate(8deg) scale(1.1); }
          75% { transform: rotate(-5deg) scale(1.05); }
        }
        .charlotte-web-${uid} { transition: transform 0.2s ease-out; }
        .charlotte-web-${uid}.shaking { animation: charlotte-web-shake-${uid} 0.45s ease-in-out infinite alternate; }
      `}</style>
      <div style={backdropStyle} />
      <div className={`charlotte-web-${uid}${hovering && !reducedMotion.current ? " shaking" : ""}`} style={{ width: "100%", height: "100%", overflow: "visible" }}>
        <ResponsiveContainer width="100%" height="100%" style={{ overflow: "visible" }}>
          <RadarChart
            data={data}
            cx="50%"
            cy="50%"
            outerRadius={compact ? "94%" : "96%"}
            margin={{ top: marginY, right: marginX, bottom: marginY, left: marginX }}
          >
            <defs>
              {allSeries.map((s, si) => {
                const palette = BRAND_PALETTE[si % BRAND_PALETTE.length];
                return (
                  <g key={si}>
                    <linearGradient id={`radarGrad-${uid}-${si}`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={palette.gradientFrom} stopOpacity={0.85} />
                      <stop offset="100%" stopColor={palette.gradientTo} stopOpacity={0.85} />
                    </linearGradient>
                    <filter id={`radarGlow-${uid}-${si}`} x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </g>
                );
              })}
            </defs>
            <PolarGrid stroke="#5BA8D9" strokeOpacity={0.55} strokeWidth={1.25} />
            <PolarAngleAxis
              dataKey="dimension"
              tick={{ fontSize: tickFontSize, fill: "#0c2340", fontWeight: 700, letterSpacing: "0.05em" }}
              tickSize={10}
            />
            {allSeries.map((s, si) => {
              const palette = BRAND_PALETTE[si % BRAND_PALETTE.length];
              const strokeColor = s.color || palette.stroke;
              const fillOpacity = s.fillOpacity ?? (isMulti ? (s.dashed ? 0.12 : 0.40) : 0.45);
              return (
                <Radar
                  key={si}
                  name={s.label}
                  dataKey={`s${si}`}
                  stroke={strokeColor}
                  fill={s.dashed ? strokeColor : `url(#radarGrad-${uid}-${si})`}
                  fillOpacity={fillOpacity}
                  strokeWidth={compact ? 2 : 2.5}
                  strokeLinejoin="round"
                  strokeDasharray={s.dashed ? "5 4" : undefined}
                  filter={s.dashed ? undefined : `url(#radarGlow-${uid}-${si})`}
                  isAnimationActive={true}
                  animationDuration={900}
                  animationEasing="ease-out"
                  dot={{ r: compact ? 2.5 : 3.5, fill: strokeColor, stroke: "#0a0a0a", strokeWidth: 1 }}
                  connectNulls={false}
                />
              );
            })}
            {showLegend && (
              <Legend wrapperStyle={{ fontSize: 11, color: "#0c2340", fontWeight: 700, letterSpacing: "0.03em" }} />
            )}
          </RadarChart>
        </ResponsiveContainer>
      </div>
      {lowConfidenceAxes.length > 0 && maxR > 0 && (
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            overflow: 'visible',
          }}
          aria-hidden
        >
          {lowConfidenceAxes.map(axisIdx => {
            const angle = (-90 + (axisIdx * 360) / Math.max(numAxes, 1)) * (Math.PI / 180);
            const x2 = cx + maxR * Math.cos(angle);
            const y2 = cy + maxR * Math.sin(angle);
            return (
              <line
                key={axisIdx}
                x1={cx}
                y1={cy}
                x2={x2}
                y2={y2}
                stroke="#5BA8D9"
                strokeOpacity={0.55}
                strokeWidth={1.25}
                strokeDasharray="4 4"
              >
                <title>Score will stabilize with more data</title>
              </line>
            );
          })}
        </svg>
      )}
      {spider && (
        <img
          src={charlotteMascot}
          alt="Charlotte"
          aria-hidden
          draggable={false}
          style={{
            position: "absolute",
            left: spider.x - spiderSize / 2,
            top: spider.y - spiderSize / 2,
            width: spiderSize,
            height: spiderSize,
            pointerEvents: "none",
            transition: "left 250ms ease-out, top 250ms ease-out, transform 250ms ease-out",
            transform: `rotate(${spiderAngle}deg)`,
            filter: "drop-shadow(0 2px 4px rgba(12,35,64,0.35))",
            animation: reducedMotion.current
              ? undefined
              : jiggling
                ? `charlotte-jiggle-${uid} 1.4s ease-in-out`
                : `charlotte-idle-${uid} 2.4s ease-in-out infinite`,
            zIndex: 5,
          }}
        />
      )}
    </div>
  );
}
