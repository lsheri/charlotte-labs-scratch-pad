/**
 * SINGLE SOURCE OF TRUTH for thread / receipt / user / workflow display labels
 * AND the rules that decide what counts as a workflow vs a plain receipt.
 *
 * Both participant-facing AND admin-facing views must import from here so
 * any rename or rule change propagates automatically across the product
 * (participant fingerprint, receipts list, admin user/receipt detail pages,
 * researcher exports, etc).
 */

import { format } from "date-fns";

export interface ThreadLike {
  id: string;
  summary?: string | null;
  title?: string | null;
  first_captured_at?: string | null;
  last_captured_at?: string | null;
  tool?: string | null;
}

export interface ReceiptLike {
  id: string;
  prompt_preview?: string | null;
  tool_used?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

/* ----------------------------- Workflow type ----------------------------- */

export const WORKFLOW_TYPES = [
  "document", "presentation", "spreadsheet", "code", "app",
  "communication", "brainstorm", "research", "plan", "study",
  "data-analysis", "creative", "other", "custom",
] as const;
export type WorkflowType = typeof WORKFLOW_TYPES[number];

export const WORKFLOW_TYPE_LABELS: Record<WorkflowType, string> = {
  document: "Document",
  presentation: "Presentation",
  spreadsheet: "Spreadsheet",
  code: "Code",
  app: "App",
  communication: "Communication / Message",
  brainstorm: "Brainstorm",
  research: "Research",
  plan: "Plan",
  study: "Study notes",
  "data-analysis": "Data analysis",
  creative: "Creative",
  other: "Other",
  custom: "Custom…",
};

export function getWorkflowType(r: ReceiptLike): WorkflowType {
  const v = (r.metadata as any)?.workflowType;
  if (typeof v === "string" && (WORKFLOW_TYPES as readonly string[]).includes(v)) {
    return v as WorkflowType;
  }
  return "other";
}

export function getWorkflowTypeLabel(r: ReceiptLike): string {
  const t = getWorkflowType(r);
  if (t === "custom") {
    const custom = (r.metadata as any)?.workflowTypeCustom;
    if (typeof custom === "string" && custom.trim()) return custom.trim().slice(0, 32);
  }
  return WORKFLOW_TYPE_LABELS[t];
}

/** Up to 2 secondary types stored as tag-style hints. Do NOT affect recommendations. */
export function getWorkflowTypeExtras(r: ReceiptLike): WorkflowType[] {
  const raw = (r.metadata as any)?.workflowTypeExtras;
  if (!Array.isArray(raw)) return [];
  const out: WorkflowType[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    if (!(WORKFLOW_TYPES as readonly string[]).includes(v)) continue;
    if (out.includes(v as WorkflowType)) continue;
    out.push(v as WorkflowType);
    if (out.length >= 2) break;
  }
  return out;
}

export function getWorkflowTypeCustom(r: ReceiptLike): string | null {
  const v = (r.metadata as any)?.workflowTypeCustom;
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 32) : null;
}

/** Did the user explicitly pick a workflow output type at create time? */
export function isWorkflowTypeExplicit(r: ReceiptLike): boolean {
  return Boolean((r.metadata as any)?.workflowTypeSet);
}

/* -------------------------------- Purpose -------------------------------- */

export const PURPOSES = ["work", "school", "personal", "client", "research", "other"] as const;
export type Purpose = typeof PURPOSES[number];

export const PURPOSE_LABELS: Record<Purpose, string> = {
  work: "Work",
  school: "School",
  personal: "Personal",
  client: "Client",
  research: "Research",
  other: "Other",
};

export function getWorkflowPurpose(r: ReceiptLike): Purpose | null {
  const v = (r.metadata as any)?.purpose;
  if (typeof v === "string" && (PURPOSES as readonly string[]).includes(v)) return v as Purpose;
  return null;
}

/* --------------------------------- Tags --------------------------------- */

export const SUGGESTED_TAGS = [
  "research", "writing", "planning", "analysis",
  "design", "coding", "personal", "client-work",
] as const;

export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 24);
}

export function normalizeTags(raw: string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const t of raw ?? []) {
    const n = normalizeTag(String(t));
    if (n && !out.includes(n)) out.push(n);
    if (out.length >= 5) break;
  }
  return out;
}

export function getWorkflowTags(r: ReceiptLike): string[] {
  const raw = (r.metadata as any)?.tags;
  if (!Array.isArray(raw)) return [];
  return normalizeTags(raw as string[]);
}

/* ----------------------------- Tool extraction --------------------------- */

export function getReceiptTools(r: ReceiptLike): string[] {
  const set = new Set<string>();
  if (r.tool_used) set.add(String(r.tool_used).toLowerCase());
  const extras = (r.metadata as any)?.tools;
  if (Array.isArray(extras)) extras.forEach((t) => { if (t) set.add(String(t).toLowerCase()); });
  return Array.from(set);
}

/**
 * Decides whether a receipt represents an actual AI Collaboration Workflow.
 * Rule: ≥2 distinct tools chained together, OR a single tool where the user
 * explicitly picked an output type at creation. Plain single-tool receipts
 * with no declared output type stay as Receipts only.
 */
export function isWorkflow(r: ReceiptLike): boolean {
  if (getReceiptTools(r).length >= 2) return true;
  return isWorkflowTypeExplicit(r);
}

/* ------------------------------ Provenance ------------------------------- */
/**
 * Provenance answers: was this work done in a verifiable context (Lab Work),
 * or is it casual self-directed exploration (Personal Tinkering)?
 *
 * Source distinguishes how we know:
 *   - auto_session   : participant was in an active research session at create time
 *   - user           : self-reported in the create dialog
 *   - admin_verified : an admin/teacher confirmed it (future quality gate)
 */
export const PROVENANCE = ["lab", "personal"] as const;
export type Provenance = typeof PROVENANCE[number];

export const PROVENANCE_LABELS: Record<Provenance, string> = {
  lab: "Lab Work",
  personal: "Personal Tinkering",
};

export const PROVENANCE_SOURCES = ["auto_session", "user", "admin_verified"] as const;
export type ProvenanceSource = typeof PROVENANCE_SOURCES[number];

export const PROVENANCE_SOURCE_LABELS: Record<ProvenanceSource, string> = {
  auto_session: "Auto-detected from session",
  user: "Self-reported",
  admin_verified: "Verified by admin",
};

export function getProvenance(r: ReceiptLike): Provenance {
  const v = (r.metadata as any)?.provenance;
  if (v === "lab" || v === "personal") return v;
  return "personal";
}

export function getProvenanceSource(r: ReceiptLike): ProvenanceSource | null {
  const v = (r.metadata as any)?.provenanceSource;
  if (v === "auto_session" || v === "user" || v === "admin_verified") return v;
  return null;
}

export function isVerifiedLab(r: ReceiptLike): boolean {
  return getProvenance(r) === "lab" && getProvenanceSource(r) === "admin_verified";
}

export function inferProvenanceForCreate(opts: { inSession: boolean; userPicked?: Provenance | null }): {
  provenance: Provenance; provenanceSource: ProvenanceSource;
} {
  if (opts.userPicked === "lab" || opts.userPicked === "personal") {
    return { provenance: opts.userPicked, provenanceSource: "user" };
  }
  return opts.inSession
    ? { provenance: "lab", provenanceSource: "auto_session" }
    : { provenance: "personal", provenanceSource: "auto_session" };
}

/* ------------------------------ Display names ---------------------------- */

export function getThreadDisplayName(t: ThreadLike): string {
  const s = (t.summary ?? "").trim();
  if (s) return s.length > 80 ? s.slice(0, 77) + "…" : s;
  const title = (t.title ?? "").trim();
  if (title) return title.length > 80 ? title.slice(0, 77) + "…" : title;
  const when = t.first_captured_at ?? t.last_captured_at;
  if (when) return `Chat from ${format(new Date(when), "MMM d, yyyy · h:mm a")}`;
  return "Untitled chat";
}

export function getReceiptDisplayName(r: ReceiptLike): string {
  const label = ((r.metadata as any)?.label ?? "").toString().trim();
  if (label) return label.length > 80 ? label.slice(0, 77) + "…" : label;
  const p = (r.prompt_preview ?? "").trim();
  if (p) return p.length > 80 ? p.slice(0, 77) + "…" : p;
  const tool = r.tool_used ? r.tool_used : "Receipt";
  if (r.created_at) {
    return `${tool} · ${format(new Date(r.created_at), "MMM d, yyyy · h:mm a")}`;
  }
  return `${tool} receipt`;
}

export interface TemplateLike {
  id?: string;
  name?: string | null;
  workflow_type?: string | null;
  created_at?: string | null;
}
export function getTemplateDisplayName(t: TemplateLike): string {
  const n = (t.name ?? "").trim();
  if (n) return n.length > 80 ? n.slice(0, 77) + "…" : n;
  return "Untitled template";
}

/* ------------------------------ Anonymity -------------------------------- */

export function anonymousLabel(userId: string, prefix = "Participant"): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return `${prefix}-${h.toString(16).toUpperCase().slice(0, 4).padStart(4, "0")}`;
}

export function safeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "untitled";
}
