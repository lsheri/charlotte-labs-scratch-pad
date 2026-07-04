import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ToolLogo } from "@/components/ToolLogo";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  getReceiptDisplayName, getWorkflowType, WORKFLOW_TYPE_LABELS, WORKFLOW_TYPES,
  type WorkflowType, isWorkflow, getWorkflowTags, getWorkflowPurpose,
  PURPOSES, PURPOSE_LABELS, type Purpose,
  PROVENANCE, PROVENANCE_LABELS, type Provenance,
  getProvenance, isVerifiedLab,
} from "@/lib/displayNames";
import { ProvenanceVial } from "@/components/provenance/ProvenanceVial";
import { Workflow as WorkflowIcon } from "lucide-react";
import { posthog } from "@/lib/posthog";

interface Props {
  participantId: string | null;
  sessionId: string | null;
}

export function WorkflowsSection({ participantId, sessionId }: Props) {
  const [typeFilter, setTypeFilterState] = useState<WorkflowType | "all">("all");
  const [purposeFilter, setPurposeFilterState] = useState<Purpose | "all">("all");
  const [tagFilter, setTagFilterState] = useState<string | "all">("all");
  const [provenanceFilter, setProvenanceFilterState] = useState<Provenance | "all">("all");

  const setTypeFilter = (v: WorkflowType | "all") => { setTypeFilterState(v); posthog.capture("workflow_filter_changed", { facet: "type", value: v }); };
  const setPurposeFilter = (v: Purpose | "all") => { setPurposeFilterState(v); posthog.capture("workflow_filter_changed", { facet: "purpose", value: v }); };
  const setTagFilter = (v: string | "all") => { setTagFilterState(v); posthog.capture("workflow_filter_changed", { facet: "tag", value: v }); };
  const setProvenanceFilter = (v: Provenance | "all") => { setProvenanceFilterState(v); posthog.capture("workflow_filter_changed", { facet: "provenance", value: v }); };

  const q = useQuery({
    queryKey: ["fingerprint-workflows", participantId, sessionId],
    enabled: !!participantId,
    queryFn: async () => {
      let qq = supabase.from("receipts")
        .select("id, tool_used, prompt_preview, created_at, metadata")
        .eq("participant_id", participantId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (sessionId) qq = qq.eq("session_id", sessionId);
      const { data, error } = await qq;
      if (error) throw error;
      return data ?? [];
    },
  });

  const all = (q.data ?? [])
    .filter((r) => isWorkflow(r as any))
    .map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const tools = new Set<string>();
      if (r.tool_used) tools.add(r.tool_used.toLowerCase());
      const extras = Array.isArray(meta.tools) ? (meta.tools as string[]) : [];
      extras.forEach((t) => tools.add(String(t).toLowerCase()));
      return {
        id: r.id,
        name: getReceiptDisplayName(r as any),
        type: getWorkflowType(r as any),
        tools: Array.from(tools),
        tags: getWorkflowTags(r as any),
        purpose: getWorkflowPurpose(r as any),
        provenance: getProvenance(r as any),
        verified: isVerifiedLab(r as any),
        createdAt: r.created_at,
      };
    });

  const allTags = Array.from(new Set(all.flatMap((w) => w.tags))).sort();

  const visible = all.filter((w) => {
    if (typeFilter !== "all" && w.type !== typeFilter) return false;
    if (purposeFilter !== "all" && w.purpose !== purposeFilter) return false;
    if (tagFilter !== "all" && !w.tags.includes(tagFilter)) return false;
    if (provenanceFilter !== "all" && w.provenance !== provenanceFilter) return false;
    return true;
  });

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <WorkflowIcon className="h-5 w-5" /> Your AI Collaboration Workflows
          </h2>
          <p className="text-xs text-muted-foreground">
            Multi-tool chains and named single-tool builds. Pick an output type when you bundle threads to track it here.
          </p>
        </div>
        <Link to="/participant/workflows" className="text-xs text-primary hover:underline">
          Templates →
        </Link>
      </div>

      <div className="space-y-1.5">
        <FilterRow label="Type">
          <FilterChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>All ({all.length})</FilterChip>
          {WORKFLOW_TYPES.map((t) => {
            const c = all.filter((w) => w.type === t).length;
            if (!c) return null;
            return (
              <FilterChip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
                {WORKFLOW_TYPE_LABELS[t]} ({c})
              </FilterChip>
            );
          })}
        </FilterRow>
        <FilterRow label="Purpose">
          <FilterChip active={purposeFilter === "all"} onClick={() => setPurposeFilter("all")}>All</FilterChip>
          {PURPOSES.map((p) => {
            const c = all.filter((w) => w.purpose === p).length;
            if (!c) return null;
            return (
              <FilterChip key={p} active={purposeFilter === p} onClick={() => setPurposeFilter(p)}>
                {PURPOSE_LABELS[p]} ({c})
              </FilterChip>
            );
          })}
        </FilterRow>
        <FilterRow label="Provenance">
          <FilterChip active={provenanceFilter === "all"} onClick={() => setProvenanceFilter("all")}>All</FilterChip>
          {PROVENANCE.map((p) => {
            const c = all.filter((w) => w.provenance === p).length;
            if (!c) return null;
            return (
              <FilterChip key={p} active={provenanceFilter === p} onClick={() => setProvenanceFilter(p)}>
                <span className="inline-flex items-center gap-1.5">
                  <ProvenanceVial variant={p} size="sm" />
                  {PROVENANCE_LABELS[p]} ({c})
                </span>
              </FilterChip>
            );
          })}
        </FilterRow>
        {allTags.length > 0 && (
          <FilterRow label="Tags">
            <FilterChip active={tagFilter === "all"} onClick={() => setTagFilter("all")}>All</FilterChip>
            {allTags.map((t) => (
              <FilterChip key={t} active={tagFilter === t} onClick={() => setTagFilter(t)}>
                #{t}
              </FilterChip>
            ))}
          </FilterRow>
        )}
      </div>

      {visible.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          {all.length === 0
            ? "No workflows yet. Bundle threads from multiple tools or pick an output type when you bundle threads."
            : "No workflows match these filters."}
        </CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {visible.map((w) => (
            <Link
              key={w.id}
              to="/participant/receipts/$receiptId"
              params={{ receiptId: w.id }}
              onClick={() => posthog.capture("workflow_card_clicked", {
                receipt_id: w.id, type: w.type, provenance: w.provenance,
                tool_count: w.tools.length, tag_count: w.tags.length,
              })}
            >
              <Card className="hover:border-primary transition-colors">
                <CardContent className="flex items-center gap-3 py-3">
                  <ProvenanceVial variant={w.provenance} verified={w.verified} size="md" />
                  <div className="flex -space-x-1">
                    {w.tools.slice(0, 4).map((t) => (
                      <div key={t} className="ring-2 ring-background rounded-full bg-background">
                        <ToolLogo tool={t} size={22} />
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{w.name}</div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      <Badge variant="outline">{WORKFLOW_TYPE_LABELS[w.type]}</Badge>
                      {w.purpose && <Badge variant="secondary">{PURPOSE_LABELS[w.purpose]}</Badge>}
                      {w.tags.map((t) => <span key={t}>#{t}</span>)}
                      <span>· {w.tools.length} tool{w.tools.length === 1 ? "" : "s"}</span>
                      {w.createdAt && <span>· {format(new Date(w.createdAt), "MMM d, yyyy")}</span>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-16 shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
        active ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"
      }`}
    >
      {children}
    </button>
  );
}
