import { X, ArrowRight, User, Bot } from "lucide-react";
import {
  INTENT_META,
  OUTCOME_META,
  type ContextMapNode,
  type Intent,
  type Outcome,
} from "./types";

interface Props {
  node: ContextMapNode | null;
  allNodes: ContextMapNode[];
  onClose: () => void;
  onJump: (id: string) => void;
}

export function NodeInspector({ node, allNodes, onClose, onJump }: Props) {
  if (!node) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Click any node to inspect the prompt, the intent, and what changed
        after.
      </div>
    );
  }

  const intent = (node.intent as Intent) ?? "question";
  const outcome = (node.outcome as Outcome) ?? "carried_forward";
  const meta = INTENT_META[intent];
  const om = OUTCOME_META[outcome];

  // Siblings share the same parentTurnIndex
  const siblings = allNodes.filter(
    (n) =>
      n.id !== node.id &&
      typeof n.parentTurnIndex === "number" &&
      n.parentTurnIndex === node.parentTurnIndex,
  );

  const driver = node.whoDroveThis ?? "human";

  return (
    <div className="p-3 max-h-[640px] overflow-auto">
      <div className="flex items-start justify-between gap-2">
        <div className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${meta.bgSoft} ${meta.text}`}>
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
          <span className="text-[10px] uppercase tracking-wide font-semibold">
            {meta.label}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-slate-100"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 text-[13px] font-semibold text-[#0A2848] leading-snug">
        {node.label ?? node.title}
      </div>

      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="tabular-nums">turn {node.turnIndex}</span>
        <span>·</span>
        <span className="inline-flex items-center gap-1">
          {driver === "ai" ? (
            <Bot className="h-3 w-3" />
          ) : (
            <User className="h-3 w-3" />
          )}
          {driver === "ai" ? "AI-driven" : driver === "both" ? "Human + AI" : "Human-driven"}
        </span>
        <span>·</span>
        <span>{om.label}</span>
      </div>

      {node.verbatimQuote && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Verbatim prompt
          </div>
          <blockquote className="mt-1 rounded border-l-2 border-slate-300 bg-slate-50 p-2 text-xs italic text-foreground/80">
            {node.verbatimQuote}
          </blockquote>
        </div>
      )}

      {node.summary && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Analyst summary
          </div>
          <p className="mt-1 text-xs text-foreground/80 leading-relaxed">
            {node.summary}
          </p>
        </div>
      )}

      {node.whatChangedAfter && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            What changed after
          </div>
          <p className="mt-1 text-xs text-foreground/80 leading-relaxed">
            {node.whatChangedAfter}
          </p>
        </div>
      )}

      {node.whyItMattered && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Why it mattered
          </div>
          <p className="mt-1 text-xs text-foreground/80 leading-relaxed">
            {node.whyItMattered}
          </p>
        </div>
      )}

      {siblings.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            Sibling turns
          </div>
          <ul className="space-y-1">
            {siblings.slice(0, 6).map((s) => {
              const sMeta = INTENT_META[(s.intent as Intent) ?? "question"];
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onJump(s.id)}
                    className="w-full text-left flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-slate-100"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${sMeta.dot}`} />
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      t{s.turnIndex}
                    </span>
                    <span className="text-xs text-foreground/80 truncate">
                      {s.label ?? s.title}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
