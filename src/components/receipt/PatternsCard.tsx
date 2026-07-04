import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ReceiptPattern } from "@/serverfn/receipt-checkup";

interface Props { patterns: ReceiptPattern[]; loading?: boolean }

export function PatternsCard({ patterns, loading }: Props) {
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text);
    toast.success("Template copied");
  };
  return (
    <Card data-tour="patterns">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" />
          Patterns to Templatize
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <p className="text-xs text-muted-foreground">Charlotte is reading across your similar runs…</p>}
        {!loading && patterns.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No repeatable patterns yet. Once you log more runs of this type, Charlotte will surface what consistently works for you.
          </p>
        )}
        {patterns.map((p, i) => (
          <div key={i} className="rounded-md border p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold">{p.title}</p>
              <span className="text-[10px] text-muted-foreground shrink-0">across {p.appliesAcrossCount} runs</span>
            </div>
            <p className="text-xs text-muted-foreground">{p.takeaway}</p>
            <div className="text-[11px] italic text-muted-foreground bg-muted/40 rounded px-2 py-1.5">
              "{p.exampleFromThisReceipt}"
            </div>
            <div className="flex items-start gap-2">
              <code className="flex-1 text-[11px] bg-muted/60 rounded px-2 py-1.5 font-mono whitespace-pre-wrap break-words">
                {p.suggestedTemplate}
              </code>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => copy(p.suggestedTemplate)}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
