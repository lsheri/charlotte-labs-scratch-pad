export type NodeType =
  | "starting_question"
  | "branch_explored"
  | "insight"
  | "reframe"
  | "evidence"
  | "human_decision"
  | "rejected_path"
  | "paused_idea"
  | "open_question"
  | "final_direction";

export type NodeStatus = "active" | "resolved" | "rejected" | "paused" | "open";
export type BranchColor =
  | "sky"
  | "amber"
  | "violet"
  | "teal"
  | "rose"
  | "emerald"
  | "indigo";

export interface Branch {
  id: string;
  title: string;
  color: BranchColor;
  status: NodeStatus;
}

export type StoryRole =
  | "goal"
  | "ai_proposal"
  | "user_correction"
  | "user_reframe"
  | "decision"
  | "paused"
  | "open_loop"
  | "final_output";

export type Driver = "human" | "ai" | "both";

export type Intent =
  | "question"
  | "refine"
  | "verify"
  | "reject"
  | "pivot"
  | "produce_artifact"
  | "resume";

export type Outcome = "carried_forward" | "dropped" | "paused" | "resolved";

export interface ContextMapNode {
  id: string;
  type: NodeType;
  storyRole?: StoryRole;
  branchId?: string;
  turnIndex?: number;
  parentTurnIndex?: number | null;
  intent?: Intent;
  outcome?: Outcome;
  label?: string;
  verbatimQuote?: string;
  spansBranches?: string[];
  title: string;
  summary?: string;
  whyItMattered?: string;
  whoDroveThis?: Driver;
  whatChangedAfter?: string;
  memoryCue?: string;
  status: NodeStatus;
  order: number;
  relatedNodeIds?: string[];
}

export interface KeyBranch {
  title: string;
  explored: string;
  whatChanged?: string;
  outcome: string;
  status: "active_direction" | "resolved" | "rejected" | "paused" | "open";
}

export interface HumanJudgment {
  title: string;
  aiContribution?: string;
  humanMove?: string;
  description?: string;
  impact?: string;
}

export interface PausedPath {
  title: string;
  whyPausedOrRejected: string;
  revisitPotential: "low" | "medium" | "high";
  revisitNote?: string;
}

export interface OpenQuestion {
  question: string;
  whyItMatters: string;
  suggestedNextStep?: string;
}

export interface MemoryHighlight {
  title: string;
  detail: string;
  whyItMattersNow: string;
}

export interface WorkEvolutionStep {
  from: string;
  turningPoint: string;
  to: string;
  whyItChanged?: string;
}

export interface PickUpAction {
  action: string;
  whyNow?: string;
  continuationPrompt?: string;
}

export interface ContextMapAnalysis {
  receiptType?: "context_map";
  title?: string;
  conversationTitle?: string;
  receiptInsight?: string;
  startingPoint?: { originalQuestion?: string; intendedOutcome?: string };
  mapSummary?: string;
  memoryHighlights?: MemoryHighlight[];
  workEvolution?: WorkEvolutionStep[];
  branches?: Branch[];
  nodes?: ContextMapNode[];
  keyBranches?: KeyBranch[];
  humanJudgmentMoments?: HumanJudgment[];
  rejectedOrPausedPaths?: PausedPath[];
  openQuestions?: OpenQuestion[];
  finalDirection?: string[];
  pickUpHere?: PickUpAction[];
  null_reason?: string | null;
}

export const STORY_ROLE_LABEL: Record<StoryRole, string> = {
  goal: "Goal",
  ai_proposal: "AI proposal",
  user_correction: "User correction",
  user_reframe: "User reframe",
  decision: "Decision",
  paused: "Paused",
  open_loop: "Open loop",
  final_output: "Final output",
};

// Tailwind color mappings for branch tokens. Kept as literal class strings so
// the Tailwind JIT compiler picks them up.
export const BRANCH_TW: Record<
  BranchColor,
  { bg: string; bgSoft: string; text: string; border: string; stroke: string; fill: string }
> = {
  sky: {
    bg: "bg-sky-500",
    bgSoft: "bg-sky-50",
    text: "text-sky-900",
    border: "border-sky-300",
    stroke: "#0284c7",
    fill: "#0ea5e9",
  },
  amber: {
    bg: "bg-amber-500",
    bgSoft: "bg-amber-50",
    text: "text-amber-900",
    border: "border-amber-300",
    stroke: "#b45309",
    fill: "#f59e0b",
  },
  violet: {
    bg: "bg-violet-500",
    bgSoft: "bg-violet-50",
    text: "text-violet-900",
    border: "border-violet-300",
    stroke: "#6d28d9",
    fill: "#8b5cf6",
  },
  teal: {
    bg: "bg-teal-500",
    bgSoft: "bg-teal-50",
    text: "text-teal-900",
    border: "border-teal-300",
    stroke: "#0f766e",
    fill: "#14b8a6",
  },
  rose: {
    bg: "bg-rose-500",
    bgSoft: "bg-rose-50",
    text: "text-rose-900",
    border: "border-rose-300",
    stroke: "#be123c",
    fill: "#f43f5e",
  },
  emerald: {
    bg: "bg-emerald-500",
    bgSoft: "bg-emerald-50",
    text: "text-emerald-900",
    border: "border-emerald-300",
    stroke: "#047857",
    fill: "#10b981",
  },
  indigo: {
    bg: "bg-indigo-500",
    bgSoft: "bg-indigo-50",
    text: "text-indigo-900",
    border: "border-indigo-300",
    stroke: "#4338ca",
    fill: "#6366f1",
  },
};

export const STATUS_STROKE: Record<NodeStatus, string> = {
  active: "#0A2848",
  resolved: "#059669",
  rejected: "#dc2626",
  paused: "#64748b",
  open: "#ca8a04",
};

export const STATUS_PILL: Record<NodeStatus, string> = {
  active: "bg-sky-100 text-sky-900 border-sky-200",
  resolved: "bg-emerald-100 text-emerald-900 border-emerald-200",
  rejected: "bg-rose-100 text-rose-900 border-rose-200",
  paused: "bg-slate-100 text-slate-800 border-slate-200",
  open: "bg-yellow-100 text-yellow-900 border-yellow-200",
};

export const NODE_LABEL: Record<NodeType, string> = {
  starting_question: "Starting question",
  branch_explored: "Branch explored",
  insight: "Insight",
  reframe: "Reframe",
  evidence: "Evidence",
  human_decision: "Human decision",
  rejected_path: "Rejected path",
  paused_idea: "Paused idea",
  open_question: "Open question",
  final_direction: "Final direction",
};

/** Node radius by importance/type. */
export function nodeRadius(type: NodeType): number {
  if (type === "final_direction") return 9;
  if (type === "human_decision") return 8;
  if (type === "starting_question") return 8;
  if (type === "insight" || type === "reframe") return 6.5;
  return 5.5;
}

export function hasSwimlaneShape(a?: ContextMapAnalysis | null): boolean {
  if (!a) return false;
  if (!Array.isArray(a.branches) || a.branches.length === 0) return false;
  if (!Array.isArray(a.nodes) || a.nodes.length === 0) return false;
  return a.nodes.every(
    (n) => typeof n.branchId === "string" && typeof n.turnIndex === "number",
  );
}

/** True when nodes carry parent references — the mind-map view is renderable. */
export function hasMindMapShape(a?: ContextMapAnalysis | null): boolean {
  if (!a || !Array.isArray(a.nodes) || a.nodes.length === 0) return false;
  const withTurn = a.nodes.filter((n) => typeof n.turnIndex === "number");
  if (withTurn.length < 2) return false;
  // At least one node must reference a parent (root has parentTurnIndex null).
  return withTurn.some(
    (n) => "parentTurnIndex" in n && n.parentTurnIndex !== undefined,
  );
}

export const INTENT_META: Record<
  Intent,
  { label: string; dot: string; ring: string; text: string; bgSoft: string }
> = {
  question:        { label: "Question",   dot: "bg-sky-500",     ring: "ring-sky-300",     text: "text-sky-900",     bgSoft: "bg-sky-50" },
  refine:          { label: "Refine",     dot: "bg-violet-500",  ring: "ring-violet-300",  text: "text-violet-900",  bgSoft: "bg-violet-50" },
  verify:          { label: "Verify",     dot: "bg-emerald-500", ring: "ring-emerald-300", text: "text-emerald-900", bgSoft: "bg-emerald-50" },
  reject:          { label: "Reject",     dot: "bg-rose-500",    ring: "ring-rose-300",    text: "text-rose-900",    bgSoft: "bg-rose-50" },
  pivot:           { label: "Pivot",      dot: "bg-amber-500",   ring: "ring-amber-300",   text: "text-amber-900",   bgSoft: "bg-amber-50" },
  produce_artifact:{ label: "Artifact",   dot: "bg-indigo-500",  ring: "ring-indigo-300",  text: "text-indigo-900",  bgSoft: "bg-indigo-50" },
  resume:          { label: "Resume",     dot: "bg-teal-500",    ring: "ring-teal-300",    text: "text-teal-900",    bgSoft: "bg-teal-50" },
};

export const OUTCOME_META: Record<Outcome, { label: string; edgeDash: string; opacity: number; borderDash: string }> = {
  carried_forward: { label: "Carried forward", edgeDash: "0",     opacity: 1,    borderDash: "" },
  resolved:        { label: "Resolved",        edgeDash: "0",     opacity: 1,    borderDash: "" },
  paused:          { label: "Paused",          edgeDash: "4 4",   opacity: 0.65, borderDash: "border-dashed" },
  dropped:         { label: "Dropped",         edgeDash: "2 4",   opacity: 0.55, borderDash: "border-dashed" },
};
