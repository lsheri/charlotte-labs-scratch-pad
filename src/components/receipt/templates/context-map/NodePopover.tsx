import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  NODE_LABEL,
  STATUS_PILL,
  STORY_ROLE_LABEL,
  type ContextMapNode,
} from "./types";

interface Props {
  node: ContextMapNode;
  branchTitle?: string;
  children: React.ReactNode;
}

const DRIVER_LABEL: Record<NonNullable<ContextMapNode["whoDroveThis"]>, string> = {
  human: "Human drove this",
  ai: "AI drove this",
  both: "Human + AI",
};

const DRIVER_STYLE: Record<NonNullable<ContextMapNode["whoDroveThis"]>, string> = {
  human: "bg-emerald-100 text-emerald-900 border-emerald-200",
  ai: "bg-slate-100 text-slate-800 border-slate-200",
  both: "bg-violet-100 text-violet-900 border-violet-200",
};

export function NodePopover({ node, branchTitle, children }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="top" className="w-80 text-sm">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
            {NODE_LABEL[node.type]}
          </span>
          {node.storyRole && (
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#0A2848] text-white">
              {STORY_ROLE_LABEL[node.storyRole]}
            </span>
          )}
          <span
            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${STATUS_PILL[node.status]}`}
          >
            {node.status}
          </span>
          {branchTitle && (
            <span className="text-[10px] text-muted-foreground">
              · {branchTitle}
            </span>
          )}
          {typeof node.turnIndex === "number" && (
            <span className="text-[10px] text-muted-foreground ml-auto">
              turn {node.turnIndex}
            </span>
          )}
        </div>

        <div className="font-semibold text-[#0A2848]">{node.title}</div>

        {node.whoDroveThis && (
          <div className="mt-2">
            <span
              className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${DRIVER_STYLE[node.whoDroveThis]}`}
            >
              {DRIVER_LABEL[node.whoDroveThis]}
            </span>
          </div>
        )}

        {node.summary && (
          <p className="text-foreground/80 mt-2 leading-relaxed">
            {node.summary}
          </p>
        )}
        {node.whyItMattered && (
          <p className="text-xs text-muted-foreground mt-2 italic">
            Why it mattered: {node.whyItMattered}
          </p>
        )}
        {node.whatChangedAfter && (
          <p className="text-xs text-foreground/80 mt-2">
            <span className="uppercase tracking-wide text-muted-foreground mr-1">
              What changed after:
            </span>
            {node.whatChangedAfter}
          </p>
        )}
        {node.memoryCue && (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
            <span className="font-semibold">Remember:</span> {node.memoryCue}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
