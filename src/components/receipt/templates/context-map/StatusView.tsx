import {
  BRANCH_TW,
  NODE_LABEL,
  type Branch,
  type ContextMapNode,
  type NodeStatus,
} from "./types";

interface Props {
  branches: Branch[];
  nodes: ContextMapNode[];
}

const COLUMNS: { key: NodeStatus; label: string; tint: string }[] = [
  { key: "active", label: "Active", tint: "bg-sky-50 border-sky-200" },
  { key: "resolved", label: "Resolved", tint: "bg-emerald-50 border-emerald-200" },
  { key: "open", label: "Open", tint: "bg-yellow-50 border-yellow-200" },
  { key: "paused", label: "Paused", tint: "bg-slate-50 border-slate-200" },
  { key: "rejected", label: "Rejected", tint: "bg-rose-50 border-rose-200" },
];

export function StatusView({ branches, nodes }: Props) {
  const branchById = new Map<string, Branch>();
  for (const b of branches) branchById.set(b.id, b);

  const populatedColumns = COLUMNS.filter((c) =>
    nodes.some((n) => n.status === c.key),
  ).length;
  const mostlyEmpty = populatedColumns <= 1 && nodes.length > 0;

  return (
    <div className="space-y-3">
      {mostlyEmpty && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700">
          Most of this conversation resolved into a single direction. Open and
          paused branches will appear here when present.
        </div>
      )}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-5">
        {COLUMNS.map((col) => {
          const items = nodes.filter((n) => n.status === col.key);
          return (
            <div
              key={col.key}
              className={`rounded-lg border ${col.tint} p-2.5 min-h-[120px]`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-[#0A2848]">
                  {col.label}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {items.length}
                </span>
              </div>
              <div className="space-y-2">
                {items.map((n) => {
                  const b = n.branchId ? branchById.get(n.branchId) : undefined;
                  const tw = b ? BRANCH_TW[b.color] : null;
                  return (
                    <div key={n.id} className="rounded-md border bg-white p-2 text-xs">
                      <div className="flex items-center gap-1.5 mb-1">
                        {tw && <span className={`h-2 w-2 rounded-full ${tw.bg}`} />}
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {NODE_LABEL[n.type]}
                        </span>
                      </div>
                      <div className="font-semibold text-[#0A2848] leading-snug">
                        {n.title}
                      </div>
                      {b && (
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {b.title}
                        </div>
                      )}
                    </div>
                  );
                })}
                {items.length === 0 && (
                  <div className="text-[11px] text-muted-foreground italic">
                    none
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
