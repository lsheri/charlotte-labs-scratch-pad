import { useMemo, useRef, useState } from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";
import {
  INTENT_META,
  OUTCOME_META,
  type ContextMapNode,
  type Intent,
  type Outcome,
} from "./types";
import { layoutMindMap, type LaidOutNode } from "./tidyTreeLayout";
import { NodeInspector } from "./NodeInspector";

interface Props {
  nodes: ContextMapNode[];
  rootQuestion?: string;
}

const NODE_W = 190;
const NODE_H = 74;
const X_SPACING = 240;
const Y_SPACING = 100;
const PADDING = 32;

export function MindMapCanvas({ nodes, rootQuestion }: Props) {
  const layout = useMemo(
    () =>
      layoutMindMap(nodes, {
        xSpacing: X_SPACING,
        ySpacing: Y_SPACING,
        paddingX: PADDING,
        paddingY: PADDING,
      }),
    [nodes],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = selectedId ? layout.byId.get(selectedId)?.node ?? null : null;

  const canvasW = Math.max(720, layout.width + NODE_W + PADDING * 2);
  const canvasH = Math.max(320, layout.height + NODE_H + PADDING * 2);

  const edges = useMemo(() => {
    const list: {
      key: string;
      from: LaidOutNode;
      to: LaidOutNode;
      outcome: Outcome;
    }[] = [];
    for (const l of layout.nodes) {
      if (!l.parentId) continue;
      const parent = layout.byId.get(l.parentId);
      if (!parent) continue;
      list.push({
        key: `${parent.node.id}->${l.node.id}`,
        from: parent,
        to: l,
        outcome: (l.node.outcome as Outcome) ?? "carried_forward",
      });
    }
    return list;
  }, [layout]);

  return (
    <div className="rounded-lg border bg-slate-50/50">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b bg-white/70 px-3 py-2">
        <div className="text-xs text-muted-foreground truncate">
          {rootQuestion ? (
            <>
              <span className="uppercase tracking-wide mr-1.5">Root:</span>
              {rootQuestion}
            </>
          ) : (
            "Mind map"
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
            className="rounded border bg-white p-1 hover:bg-slate-100"
            aria-label="Zoom out"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="text-[11px] tabular-nums text-muted-foreground w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))}
            className="rounded border bg-white p-1 hover:bg-slate-100"
            aria-label="Zoom in"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="rounded border bg-white p-1 hover:bg-slate-100"
            aria-label="Reset zoom"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_320px]">
        {/* Canvas scroll region */}
        <div
          ref={wrapRef}
          className="overflow-auto max-h-[640px]"
          style={{ minHeight: 380 }}
        >
          <div
            style={{
              width: canvasW * zoom,
              height: canvasH * zoom,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}
          >
            <div
              className="relative"
              style={{ width: canvasW, height: canvasH }}
            >
              <svg
                width={canvasW}
                height={canvasH}
                className="absolute inset-0 pointer-events-none"
              >
                {edges.map((e) => {
                  const x1 = e.from.x + NODE_W + PADDING;
                  const y1 = e.from.y + NODE_H / 2 + PADDING;
                  const x2 = e.to.x + PADDING;
                  const y2 = e.to.y + NODE_H / 2 + PADDING;
                  const mx = (x1 + x2) / 2;
                  const meta = OUTCOME_META[e.outcome];
                  return (
                    <path
                      key={e.key}
                      d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke="#94a3b8"
                      strokeWidth={
                        e.to.node.intent === "produce_artifact" ? 2.5 : 1.5
                      }
                      strokeDasharray={meta.edgeDash}
                      opacity={meta.opacity}
                    />
                  );
                })}
              </svg>

              {layout.nodes.map((l) => {
                const n = l.node;
                const intent = (n.intent as Intent) ?? "question";
                const outcome = (n.outcome as Outcome) ?? "carried_forward";
                const meta = INTENT_META[intent];
                const om = OUTCOME_META[outcome];
                const isSelected = selectedId === n.id;
                const label = n.label ?? n.title;
                return (
                  <button
                    type="button"
                    key={n.id}
                    onClick={() => setSelectedId(n.id)}
                    className={`absolute text-left rounded-lg border bg-white p-2 shadow-sm transition ring-offset-2 hover:shadow-md ${om.borderDash} ${
                      isSelected ? `ring-2 ${meta.ring}` : ""
                    }`}
                    style={{
                      left: l.x + PADDING,
                      top: l.y + PADDING,
                      width: NODE_W,
                      height: NODE_H,
                      opacity: om.opacity,
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                      <span className={`text-[10px] uppercase tracking-wide ${meta.text}`}>
                        {meta.label}
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                        turn {n.turnIndex}
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] font-semibold text-[#0A2848] leading-snug line-clamp-2">
                      {label}
                    </div>
                    {n.verbatimQuote && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground italic line-clamp-1">
                        “{n.verbatimQuote}”
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Inspector */}
        <div className="border-t lg:border-t-0 lg:border-l bg-white">
          <NodeInspector
            node={selected}
            onClose={() => setSelectedId(null)}
            onJump={(id) => setSelectedId(id)}
            allNodes={nodes}
          />
        </div>
      </div>

      {/* Legend */}
      <div className="border-t bg-white/70 px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="uppercase tracking-wide">Legend</span>
        {(Object.keys(INTENT_META) as Intent[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${INTENT_META[k].dot}`} />
            {INTENT_META[k].label}
          </span>
        ))}
        <span className="mx-2 h-3 w-px bg-slate-300" />
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-slate-400" /> carried
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-0 w-4 border-t border-dashed border-slate-400"
            style={{ borderTopWidth: 2 }}
          />{" "}
          paused/dropped
        </span>
      </div>
    </div>
  );
}
