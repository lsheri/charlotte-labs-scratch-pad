import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Trash2, Workflow as WorkflowIcon, ChevronLeft } from "lucide-react";
import { ToolLogo } from "@/components/ToolLogo";
import { listMyTemplates, deleteTemplate, setTemplateShared } from "@/serverfn/templates";
import { WORKFLOW_TYPE_LABELS, PURPOSE_LABELS, getTemplateDisplayName } from "@/lib/displayNames";
import { format } from "date-fns";
import { toast } from "sonner";
import { posthog } from "@/lib/posthog";

export const Route = createFileRoute("/participant/workflows")({ component: TemplatesPage });

function TemplatesPage() {
  const listFn = useServerFn(listMyTemplates);
  const delFn = useServerFn(deleteTemplate);
  const shareFn = useServerFn(setTemplateShared);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const r = await listFn(); setItems((r as any).templates ?? []); }
    catch { setItems([]); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    try {
      await delFn({ data: { id } });
      posthog.capture("workflow_template_deleted", { template_id: id });
      toast.success("Deleted"); load();
    } catch (e: any) {
      posthog.capture("workflow_template_delete_failed", { template_id: id, error: e?.message });
      toast.error(e.message);
    }
  };

  const toggleShare = async (id: string, next: boolean) => {
    try {
      await shareFn({ data: { id, isShared: next } });
      posthog.capture("workflow_template_share_toggled", { template_id: id, is_shared: next });
      load();
    } catch (e: any) {
      posthog.capture("workflow_template_share_failed", { template_id: id, is_shared: next, error: e?.message });
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <Link to="/participant/fingerprint"><Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4 mr-1" />Back to Fingerprint</Button></Link>
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <WorkflowIcon className="h-6 w-6" /> Workflow Templates
        </h1>
        <p className="text-sm text-muted-foreground">
          Reusable AI Collaboration Workflow recipes you've saved. Share opt-in to contribute to the research library.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          No templates yet. When you bundle threads into a workflow, toggle "Save as a reusable template".
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {items.map((t) => (
            <Card key={t.id}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base truncate">{getTemplateDisplayName(t)}</CardTitle>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline">{WORKFLOW_TYPE_LABELS[(t.workflow_type ?? "other") as keyof typeof WORKFLOW_TYPE_LABELS] ?? "Other"}</Badge>
                    {t.purpose && <Badge variant="secondary">{PURPOSE_LABELS[t.purpose as keyof typeof PURPOSE_LABELS] ?? t.purpose}</Badge>}
                    {(t.tags ?? []).map((tag: string) => <span key={tag} className="text-xs text-muted-foreground">#{tag}</span>)}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(t.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3 pt-0">
                <div className="flex items-center gap-1.5">
                  {(t.tool_sequence ?? []).map((tool: string, i: number) => (
                    <div key={i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-muted-foreground">→</span>}
                      <ToolLogo tool={tool} size={20} />
                      <span className="text-xs">{tool}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-muted-foreground">
                    {t.created_at ? format(new Date(t.created_at), "MMM d, yyyy") : ""}
                  </span>
                  <label className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Share to research library</span>
                    <Switch checked={!!t.is_shared} onCheckedChange={(c) => toggleShare(t.id, c)} />
                  </label>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
