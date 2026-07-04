import { ToolLogo } from "@/components/ToolLogo";
import { toolLabel } from "@/lib/toolLogos";
import { ArrowRight, GitBranch } from "lucide-react";

export function WorkflowStack({ tools, label }: { tools: string[]; label?: string }) {
  if (!tools || tools.length === 0) return null;
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <GitBranch className="h-3.5 w-3.5" />
        Part of AI Workflow Stack{label ? <span className="ml-1 normal-case text-foreground">: {label}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {tools.map((t, i) => (
          <div key={`${t}-${i}`} className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 shadow-sm">
              <ToolLogo tool={t} size={20} />
              <span className="text-sm font-medium">{toolLabel(t)}</span>
            </div>
            {i < tools.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>
    </div>
  );
}
