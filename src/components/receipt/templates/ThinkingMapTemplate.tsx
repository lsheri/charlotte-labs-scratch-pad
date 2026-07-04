import { useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

interface Turn {
  idx?: number;
  role?: string;
  content?: string;
}


type ColorType =
  | "sky"
  | "gray"
  | "gold"
  | "mint"
  | "green"
  | "risk"
  | "navy"
  | "gray-dashed";

const COLOR: Record<ColorType, { bg: string; fg: string; dashed?: boolean }> = {
  sky: { bg: "#68C0F8", fg: "#0A2848" },
  gray: { bg: "#E5E7EB", fg: "#0A2848" },
  gold: { bg: "#E8A33D", fg: "#0A2848" },
  mint: { bg: "#28D870", fg: "#0A2848" },
  green: { bg: "#28D870", fg: "#0A2848" },
  risk: { bg: "#E05A4E", fg: "#FFFFFF" },
  navy: { bg: "#0A2848", fg: "#FFFFFF" },
  "gray-dashed": { bg: "#F3F4F6", fg: "#0A2848", dashed: true },
};

interface AnalysisNode {
  id: string;
  type: string;
  color_type: ColorType;
  label: string;
  quote: string;
  turn_index: number;
  loop_id: string | null;
}
interface AnalysisEdge {
  from: string;
  to: string;
  type: "sequential" | "abandonment" | "loop_coil";
}
interface ThinkingMapAnalysis {
  template?: "thinking_map";
  session_summary?: string;
  nodes?: AnalysisNode[];
  edges?: AnalysisEdge[];
  loop_labels?: { loop_id: string; topic: string }[];
  null_reason?: string | null;
}

interface Props {
  receiptId: string;
  analysis?: ThinkingMapAnalysis | null;
  // Original transcript turns; when provided enables "view user turn" details.
  turns?: Turn[];
}


function MapNode({ data }: NodeProps) {
  const d = data as unknown as {
    label: string;
    quote: string;
    tooltip: string;
    color: ColorType;
  };
  const c = COLOR[d.color] ?? COLOR.gray;
  const quote =
    d.quote && d.quote.length > 90 ? d.quote.slice(0, 90) + "…" : d.quote;
  return (
    <div
      title={d.tooltip}
      style={{
        background: c.bg,
        color: c.fg,
        border: c.dashed
          ? "1.5px dashed #0A2848"
          : "1px solid rgba(10,40,72,0.15)",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 11,
        fontWeight: 500,
        width: 190,
        lineHeight: 1.3,
      }}
    >
      <div style={{ fontWeight: 600 }}>{d.label}</div>
      {quote && (
        <div
          style={{
            marginTop: 4,
            fontSize: 10,
            fontWeight: 400,
            opacity: 0.9,
            fontStyle: "italic",
          }}
        >
          "{quote}"
        </div>
      )}
    </div>
  );
}

const nodeTypes = { map: MapNode };

function layoutNodes(nodes: AnalysisNode[]): Node[] {
  // Time flows L→R. Branch nodes sit lower; loop members stack vertically.
  const X_STEP = 230;
  const loopRow = new Map<string, number>();
  let loopCounter = 0;
  return nodes.map((n, i) => {
    let y = 0;
    if (n.type === "branch") y = 200;
    else if (n.type === "loop" && n.loop_id) {
      if (!loopRow.has(n.loop_id)) loopRow.set(n.loop_id, ++loopCounter);
      y = -120 - (loopRow.get(n.loop_id) as number) * 40;
    } else if (n.type === "judgment" || n.type === "verification") y = -80;
    else if (n.type === "artifact") y = 80;
    return {
      id: n.id,
      type: "map",
      position: { x: i * X_STEP, y },
      data: {
        label: `T${n.turn_index + 1} · ${n.label}`,
        quote: n.quote ?? "",
        tooltip: n.quote ?? "",
        color: n.color_type,
      },
    } as Node;
  });
}

function buildEdges(edges: AnalysisEdge[]): Edge[] {
  return edges.map((e, i) => {
    const isAbandon = e.type === "abandonment";
    const isLoop = e.type === "loop_coil";
    return {
      id: `e-${i}`,
      source: e.from,
      target: e.to,
      type: isLoop ? "default" : "smoothstep",
      style: {
        stroke: isAbandon ? "#9CA3AF" : isLoop ? "#E05A4E" : "#0A2848",
        strokeOpacity: isAbandon ? 0.4 : 0.55,
        strokeWidth: 1.2,
        strokeDasharray: isAbandon ? "4 3" : undefined,
      },
    } as Edge;
  });
}

export function ThinkingMapTemplate({ analysis, turns }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const nodes = useMemo(
    () => layoutNodes(analysis?.nodes ?? []),
    [analysis?.nodes],
  );
  const edges = useMemo(
    () => buildEdges(analysis?.edges ?? []),
    [analysis?.edges],
  );

  const turnsByIdx = useMemo(() => {
    const m = new Map<number, Turn>();
    (turns ?? []).forEach((t, i) => {
      const idx = typeof t?.idx === "number" ? t.idx : i;
      m.set(idx, t);
    });
    return m;
  }, [turns]);

  if (!analysis) {
    return (
      <p className="text-sm text-muted-foreground">
        No analysis stored yet. Run it from the AI Analysis panel below.
      </p>
    );
  }

  if (analysis.null_reason) {
    return <EmptyState reason={analysis.null_reason} />;
  }

  const hasTurns = (turns?.length ?? 0) > 0;
  const analysisNodes = analysis.nodes ?? [];

  return (
    <div className="space-y-3">
      {analysis.session_summary && (
        <p className="text-sm text-foreground leading-relaxed">
          {analysis.session_summary}
        </p>
      )}
      <div className="h-[440px] rounded-md border bg-white">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#0A28481A" gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
      <Legend />
      {analysisNodes.length > 0 && (
        <Collapsible open={showDetails} onOpenChange={setShowDetails}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between">
              <span>
                {showDetails ? "Hide" : "Show"} node details
                {hasTurns ? " with original turns" : ""} ({analysisNodes.length})
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showDetails ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-2 rounded-md border bg-muted/20 p-3 max-h-[420px] overflow-auto">
              {analysisNodes.map((n) => {
                const turn = turnsByIdx.get(n.turn_index);
                const c = COLOR[n.color_type] ?? COLOR.gray;
                return (
                  <div key={n.id} className="rounded border bg-white p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: c.bg,
                          color: c.fg,
                          border: c.dashed ? "1px dashed #0A2848" : undefined,
                        }}
                      >
                        {n.type}
                      </span>
                      <span className="rounded bg-[#0A2848] text-white text-[10px] font-mono px-1.5 py-0.5">
                        T{n.turn_index + 1}
                      </span>
                      <span className="text-sm font-semibold text-foreground">
                        {n.label}
                      </span>
                    </div>
                    <div className="space-y-2 text-xs">
                      {n.quote && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">
                            Analyzer quote
                          </div>
                          <p className="italic text-foreground leading-relaxed">
                            "{n.quote}"
                          </p>
                        </div>
                      )}
                      {hasTurns && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">
                            Original turn{turn?.role ? ` · ${turn.role}` : ""}
                            {turn?.content
                              ? ` · ${String(turn.content).length} chars`
                              : ""}
                          </div>
                          {turn?.content ? (
                            <TurnContent content={String(turn.content)} />
                          ) : (
                            <p className="text-muted-foreground italic">
                              Turn not found in transcript.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
      {analysis.loop_labels && analysis.loop_labels.length > 0 && (

        <div className="rounded-md border bg-muted/30 p-3 text-xs">
          <div className="font-semibold text-[#0A2848] mb-1.5">
            Loops in this session
          </div>
          <ul className="space-y-1 text-muted-foreground">
            {analysis.loop_labels.map((l) => (
              <li key={l.loop_id}>
                <span className="font-mono text-[10px] mr-2">{l.loop_id}</span>
                {l.topic}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Legend() {
  const items: { color: ColorType; label: string }[] = [
    { color: "sky", label: "Prompt" },
    { color: "gray", label: "Output" },
    { color: "gold", label: "Judgment" },
    { color: "mint", label: "Verification" },
    { color: "risk", label: "Loop" },
    { color: "navy", label: "Artifact" },
    { color: "gray-dashed", label: "Branch" },
  ];
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
      {items.map((i) => {
        const c = COLOR[i.color];
        return (
          <span key={i.label} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{
                background: c.bg,
                border: c.dashed ? "1.5px dashed #0A2848" : "1px solid #0A284833",
              }}
            />
            {i.label}
          </span>
        );
      })}
    </div>
  );
}

function EmptyState({ reason }: { reason: string }) {
  return (
    <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
      {reason}
    </div>
  );
}

function TurnContent({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  const LONG = 600;
  const isLong = content.length > LONG;
  const shown = open || !isLong ? content : content.slice(0, LONG) + "…";
  return (
    <div>
      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground bg-muted/40 rounded p-2 max-h-[420px] overflow-auto">
{shown}
      </pre>
      {isLong && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-[11px] font-medium text-[#0A2848] underline"
        >
          {open ? "Show less" : `Show full turn (${content.length} chars)`}
        </button>
      )}
    </div>
  );
}
