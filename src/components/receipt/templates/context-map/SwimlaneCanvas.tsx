import { useMemo } from "react";
import {
  BRANCH_TW,
  STATUS_STROKE,
  nodeRadius,
  type Branch,
  type ContextMapNode,
} from "./types";
import { NodePopover } from "./NodePopover";

interface Props {
  branches: Branch[];
  nodes: ContextMapNode[];
}

const LANE_HEIGHT = 76;
const TOP_PAD = 40;
const BOTTOM_PAD = 24;
const LEFT_PAD = 24;
const RIGHT_PAD = 24;
const LANE_LABEL_WIDTH = 160;
const MIN_CANVAS_WIDTH = 720;
const PER_TURN_PX = 26;

export function SwimlaneCanvas({ branches, nodes }: Props) {
  const { lanes, orderedBranches, xFor, yFor, canvasWidth, canvasHeight, turnTicks } =
    useMemo(() => {
      // Root lane (starting_question), branches, outcome lane (final_direction)
      const orderedBranches: Branch[] = [
        { id: "root", title: "Starting point", color: "sky", status: "active" },
        ...branches,
        { id: "outcome", title: "Final direction", color: "emerald", status: "active" },
      ];

      const lanes = new Map<string, number>();
      orderedBranches.forEach((b, i) => lanes.set(b.id, i));

      const turnIdxs = nodes
        .map((n) => n.turnIndex ?? 0)
        .filter((n): n is number => typeof n === "number");
      const minTurn = Math.min(...turnIdxs, 0);
      const maxTurn = Math.max(...turnIdxs, minTurn + 1);
      const turnSpan = Math.max(maxTurn - minTurn, 1);

      const contentWidth = Math.max(
        MIN_CANVAS_WIDTH - LANE_LABEL_WIDTH - LEFT_PAD - RIGHT_PAD,
        turnSpan * PER_TURN_PX,
      );
      const canvasWidth = LANE_LABEL_WIDTH + LEFT_PAD + contentWidth + RIGHT_PAD;
      const canvasHeight =
        TOP_PAD + orderedBranches.length * LANE_HEIGHT + BOTTOM_PAD;

      const xFor = (turnIndex: number) =>
        LANE_LABEL_WIDTH +
        LEFT_PAD +
        ((turnIndex - minTurn) / turnSpan) * contentWidth;
      const yFor = (branchId: string) =>
        TOP_PAD + (lanes.get(branchId) ?? 0) * LANE_HEIGHT + LANE_HEIGHT / 2;

      // Turn tick marks (every ~5 turns)
      const step = Math.max(1, Math.round(turnSpan / 8));
      const turnTicks: number[] = [];
      for (let t = minTurn; t <= maxTurn; t += step) turnTicks.push(t);
      if (turnTicks[turnTicks.length - 1] !== maxTurn) turnTicks.push(maxTurn);

      return {
        lanes,
        orderedBranches,
        xFor,
        yFor,
        canvasWidth,
        canvasHeight,
        turnTicks,
      };
    }, [branches, nodes]);

  const branchById = useMemo(() => {
    const m = new Map<string, Branch>();
    for (const b of branches) m.set(b.id, b);
    return m;
  }, [branches]);

  // Group nodes by branch to draw lane spine segments
  const nodesByBranch = useMemo(() => {
    const m = new Map<string, ContextMapNode[]>();
    for (const n of nodes) {
      const key = n.branchId ?? "root";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(n);
    }
    for (const arr of m.values())
      arr.sort((a, b) => (a.turnIndex ?? 0) - (b.turnIndex ?? 0));
    return m;
  }, [nodes]);

  return (
    <div className="relative w-full overflow-x-auto rounded-xl border bg-white">
      <svg
        width={canvasWidth}
        height={canvasHeight}
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        className="block"
      >
        {/* Lane backgrounds */}
        {orderedBranches.map((b, i) => {
          const tw = BRANCH_TW[b.color] ?? BRANCH_TW.sky;
          return (
            <g key={b.id}>
              <rect
                x={0}
                y={TOP_PAD + i * LANE_HEIGHT}
                width={canvasWidth}
                height={LANE_HEIGHT}
                fill={i % 2 === 0 ? "#f8fafc" : "#ffffff"}
              />
              {/* Lane label pinned left */}
              <rect
                x={0}
                y={TOP_PAD + i * LANE_HEIGHT}
                width={LANE_LABEL_WIDTH}
                height={LANE_HEIGHT}
                fill="#ffffff"
              />
              <line
                x1={LANE_LABEL_WIDTH}
                y1={TOP_PAD + i * LANE_HEIGHT}
                x2={LANE_LABEL_WIDTH}
                y2={TOP_PAD + (i + 1) * LANE_HEIGHT}
                stroke="#e2e8f0"
              />
              <foreignObject
                x={12}
                y={TOP_PAD + i * LANE_HEIGHT + 14}
                width={LANE_LABEL_WIDTH - 20}
                height={LANE_HEIGHT - 20}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-1.5 inline-block h-2.5 w-2.5 rounded-full ${tw.bg} shrink-0`}
                  />
                  <div className="text-xs">
                    <div className="font-semibold text-[#0A2848] leading-tight">
                      {b.title}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
                      {b.status}
                    </div>
                  </div>
                </div>
              </foreignObject>
            </g>
          );
        })}

        {/* Turn axis ticks */}
        {turnTicks.map((t) => (
          <g key={`tick-${t}`}>
            <line
              x1={xFor(t)}
              y1={TOP_PAD - 8}
              x2={xFor(t)}
              y2={canvasHeight - 8}
              stroke="#f1f5f9"
            />
            <text
              x={xFor(t)}
              y={TOP_PAD - 12}
              textAnchor="middle"
              fontSize={10}
              fill="#94a3b8"
            >
              turn {t}
            </text>
          </g>
        ))}

        {/* Lane spines: connect consecutive nodes in each branch */}
        {orderedBranches.map((b) => {
          const laneNodes = nodesByBranch.get(b.id) ?? [];
          if (laneNodes.length < 2) return null;
          const tw = BRANCH_TW[b.color] ?? BRANCH_TW.sky;
          const y = yFor(b.id);
          return (
            <g key={`spine-${b.id}`}>
              {laneNodes.slice(1).map((n, i) => {
                const prev = laneNodes[i];
                return (
                  <line
                    key={`${prev.id}-${n.id}`}
                    x1={xFor(prev.turnIndex ?? 0)}
                    y1={y}
                    x2={xFor(n.turnIndex ?? 0)}
                    y2={y}
                    stroke={tw.stroke}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeDasharray={
                      b.status === "rejected" || b.status === "paused"
                        ? "4 4"
                        : undefined
                    }
                    opacity={0.65}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Cross-lane decision connectors (spansBranches) */}
        {nodes
          .filter(
            (n) =>
              n.type === "human_decision" &&
              Array.isArray(n.spansBranches) &&
              n.spansBranches.length > 1,
          )
          .map((n) => {
            const x = xFor(n.turnIndex ?? 0);
            const ys = (n.spansBranches ?? [])
              .map((bid) => yFor(bid))
              .sort((a, b) => a - b);
            const y1 = ys[0];
            const y2 = ys[ys.length - 1];
            return (
              <line
                key={`span-${n.id}`}
                x1={x}
                y1={y1}
                x2={x}
                y2={y2}
                stroke="#0A2848"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                opacity={0.5}
              />
            );
          })}

        {/* Nodes */}
        {nodes.map((n) => {
          const branchId = n.branchId ?? "root";
          const branch = branchById.get(branchId) ?? orderedBranches.find((b) => b.id === branchId);
          const color = branch?.color ?? "sky";
          const tw = BRANCH_TW[color];
          const x = xFor(n.turnIndex ?? 0);
          const y = yFor(branchId);
          const r = nodeRadius(n.type);
          const stroke = STATUS_STROKE[n.status] ?? "#0A2848";
          const isDecision = n.type === "human_decision";
          return (
            <NodePopover
              key={n.id}
              node={n}
              branchTitle={branch?.title}
            >
              <g style={{ cursor: "pointer" }}>
                {isDecision ? (
                  <rect
                    x={x - r}
                    y={y - r}
                    width={r * 2}
                    height={r * 2}
                    transform={`rotate(45 ${x} ${y})`}
                    fill={tw.fill}
                    stroke={stroke}
                    strokeWidth={2}
                  />
                ) : n.type === "final_direction" ? (
                  <polygon
                    points={`${x - r},${y - r} ${x + r},${y} ${x - r},${y + r}`}
                    fill={tw.fill}
                    stroke={stroke}
                    strokeWidth={2}
                  />
                ) : n.type === "rejected_path" ? (
                  <g>
                    <circle cx={x} cy={y} r={r} fill="#fff" stroke={stroke} strokeWidth={2} />
                    <line x1={x - r * 0.6} y1={y - r * 0.6} x2={x + r * 0.6} y2={y + r * 0.6} stroke={stroke} strokeWidth={1.5} />
                    <line x1={x + r * 0.6} y1={y - r * 0.6} x2={x - r * 0.6} y2={y + r * 0.6} stroke={stroke} strokeWidth={1.5} />
                  </g>
                ) : n.type === "paused_idea" ? (
                  <g>
                    <circle cx={x} cy={y} r={r} fill="#fff" stroke={stroke} strokeWidth={2} />
                    <line x1={x - 1.5} y1={y - r * 0.55} x2={x - 1.5} y2={y + r * 0.55} stroke={stroke} strokeWidth={1.5} />
                    <line x1={x + 1.5} y1={y - r * 0.55} x2={x + 1.5} y2={y + r * 0.55} stroke={stroke} strokeWidth={1.5} />
                  </g>
                ) : (
                  <circle
                    cx={x}
                    cy={y}
                    r={r}
                    fill={tw.fill}
                    stroke={stroke}
                    strokeWidth={2}
                  />
                )}
              </g>
            </NodePopover>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="border-t bg-slate-50/50 px-4 py-2.5 text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="font-medium text-[#0A2848] mr-1">Legend:</span>
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12"><circle cx="6" cy="6" r="4" fill="#0ea5e9" /></svg>
          node
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12"><rect x="1.5" y="1.5" width="9" height="9" transform="rotate(45 6 6)" fill="#f59e0b" /></svg>
          decision
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12"><polygon points="2,2 10,6 2,10" fill="#10b981" /></svg>
          final direction
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#64748b" strokeDasharray="4 4" strokeWidth="2"/></svg>
          paused / rejected lane
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12"><circle cx="6" cy="6" r="4" fill="#fff" stroke="#dc2626" strokeWidth="2" /></svg>
          rejected
        </span>
      </div>
    </div>
  );
}
