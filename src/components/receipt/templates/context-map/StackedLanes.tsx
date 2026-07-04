import { BRANCH_TW, NODE_LABEL, STATUS_PILL, type Branch, type ContextMapNode } from "./types";

interface Props {
  branches: Branch[];
  nodes: ContextMapNode[];
}

export function StackedLanes({ branches, nodes }: Props) {
  const ordered: Branch[] = [
    { id: "root", title: "Starting point", color: "sky", status: "active" },
    ...branches,
    { id: "outcome", title: "Final direction", color: "emerald", status: "active" },
  ];
  const byBranch = new Map<string, ContextMapNode[]>();
  for (const n of nodes) {
    const key = n.branchId ?? "root";
    if (!byBranch.has(key)) byBranch.set(key, []);
    byBranch.get(key)!.push(n);
  }
  for (const arr of byBranch.values())
    arr.sort((a, b) => (a.turnIndex ?? 0) - (b.turnIndex ?? 0));

  return (
    <div className="space-y-4">
      {ordered.map((b) => {
        const laneNodes = byBranch.get(b.id) ?? [];
        if (laneNodes.length === 0) return null;
        const tw = BRANCH_TW[b.color] ?? BRANCH_TW.sky;
        return (
          <div key={b.id} className={`rounded-lg border ${tw.border} ${tw.bgSoft} p-3`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${tw.bg}`} />
              <div className={`text-sm font-semibold ${tw.text}`}>{b.title}</div>
              <span className="text-[10px] uppercase text-muted-foreground ml-auto">
                {b.status}
              </span>
            </div>
            <ol className="relative space-y-2 pl-5 border-l-2" style={{ borderColor: tw.stroke }}>
              {laneNodes.map((n) => (
                <li key={n.id} className="relative">
                  <span
                    className={`absolute -left-[26px] top-2 h-3 w-3 rounded-full ring-2 ring-white ${tw.bg}`}
                  />
                  <div className="rounded-md border bg-white p-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {NODE_LABEL[n.type]}
                      </span>
                      {typeof n.turnIndex === "number" && (
                        <span className="text-[10px] text-muted-foreground">
                          turn {n.turnIndex}
                        </span>
                      )}
                      <span
                        className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ml-auto ${STATUS_PILL[n.status]}`}
                      >
                        {n.status}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-[#0A2848] mt-1">
                      {n.title}
                    </div>
                    {n.summary && (
                      <p className="text-xs text-foreground/80 mt-1 leading-relaxed">
                        {n.summary}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}
