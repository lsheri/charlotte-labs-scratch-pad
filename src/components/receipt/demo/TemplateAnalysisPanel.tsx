// Renders the raw AI analysis JSON for one template card on the demo page,
// with provenance + re-run controls. Keeps the existing template UI
// untouched while making the new per-template LLM output visible for
// feedback.

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Loader2, RefreshCw, Sparkles, AlertCircle } from "lucide-react";
import {
  fetchTemplateAnalyses,
  rerunTemplateAnalysis,
} from "@/lib/template-analyses.functions";
import { Button } from "@/components/ui/button";

interface AnalysisRow {
  template_key: string;
  analysis_json: unknown;
  prompt_version: number | null;
  model: string | null;
  status: string;
  error_message: string | null;
  updated_at: string;
}

interface Props {
  templateKey: string;
  receiptId: string;
  analysis: AnalysisRow | null | undefined;
  onRefetched: (rows: Record<string, AnalysisRow>) => void;
}

const TEMPLATE_KEYS_WITH_ANALYSIS = new Set([
  "thinking_map",
  "ledger",
  "still_yours",
  "proof_card",
  "shield",
  "impact_statement",
  "impact_proof",
]);

export function TemplateAnalysisPanel({
  templateKey,
  receiptId,
  analysis,
  onRefetched,
}: Props) {
  const [open, setOpen] = useState(false);
  const rerun = useServerFn(rerunTemplateAnalysis);
  const refetch = useServerFn(fetchTemplateAnalyses);

  const mutation = useMutation({
    mutationFn: async () =>
      rerun({
        data: {
          receiptId,
          templateKey: templateKey as
            | "thinking_map"
            | "ledger"
            | "still_yours"
            | "proof_card"
            | "shield"
            | "impact_statement"
            | "impact_proof",
        },
      }),
    onSuccess: async () => {
      const rows = await refetch({ data: { receiptId } });
      onRefetched(rows as Record<string, AnalysisRow>);
    },
  });

  if (!TEMPLATE_KEYS_WITH_ANALYSIS.has(templateKey)) return null;

  const hasAnalysis = !!analysis;
  const isError = analysis?.status === "error";

  return (
    <div className="mt-5 rounded-lg border border-dashed bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#0A2848]">
          <Sparkles className="h-3.5 w-3.5" />
          AI Analysis (preview)
          {!hasAnalysis && (
            <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
              not run yet
            </span>
          )}
          {isError && (
            <span className="ml-1 inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-900">
              <AlertCircle className="h-3 w-3" /> error
            </span>
          )}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open && (
        <div className="border-t bg-background/60 p-4 space-y-3">
          {hasAnalysis ? (
            <pre className="max-h-[420px] overflow-auto rounded bg-[#0A2848]/95 p-3 text-[11px] leading-relaxed text-white font-mono">
{JSON.stringify(analysis.analysis_json, null, 2)}
            </pre>
          ) : (
            <div className="text-xs text-muted-foreground">
              No analysis stored yet. Click "Run now" to generate one.
            </div>
          )}

          {analysis?.error_message && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-900">
              {analysis.error_message}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
            <div>
              {analysis ? (
                <>
                  Analyzed by{" "}
                  <span className="font-medium text-foreground">
                    {analysis.model ?? "unknown model"}
                  </span>{" "}
                  · prompt v{analysis.prompt_version ?? "?"} ·{" "}
                  {new Date(analysis.updated_at).toLocaleString()}
                </>
              ) : (
                <>No provenance — no analysis stored yet.</>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="h-7 text-xs"
            >
              {mutation.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              {hasAnalysis ? "Re-run" : "Run now"}
            </Button>
          </div>

          {mutation.isError && (
            <div className="text-[11px] text-red-700">
              {(mutation.error as Error)?.message ?? "Re-run failed"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
