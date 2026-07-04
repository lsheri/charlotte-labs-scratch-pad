import { useEffect } from "react";
import { LiteracyReceipt } from "@/components/receipt/LiteracyReceipt";
import { posthog } from "@/lib/posthog";
import { supabase } from "@/integrations/supabase/client";

interface ClassicFluencyTemplateProps {
  receiptId: string;
  run: any;
  receipt: any;
  turns: Array<{ role: string; content: string; idx: number }>;
  tools: string[];
  job: any;
  profile: any;
  recommendations: any;
}

export function ClassicFluencyTemplate({
  receiptId,
  run,
  receipt,
  turns,
  tools,
  profile,
  recommendations,
}: ClassicFluencyTemplateProps) {
  useEffect(() => {
    // 1. Upsert rendering record
    supabase
      .from("renderings")
      .upsert(
        {
          receipt_id: receiptId,
          template_key: "classic_fluency",
          payload: { rendered_at: new Date().toISOString() },
          generation_ms: 0,
        },
        { onConflict: "receipt_id,template_key" }
      )
      .then(({ error }) => {
        if (error) console.error("ClassicFluency rendering upsert failed:", error);
      });

    // 2. Telemetry: posthog + template_events (non-blocking)
    posthog.capture("template_complete", {
      template_key: "classic_fluency",
      receipt_id: receiptId,
    });

    supabase.auth.getUser().then(({ data: { user } }) => {
      supabase
        .from("template_events")
        .insert({
          template_key: "classic_fluency",
          receipt_id: receiptId,
          event: "complete",
          user_id: user?.id ?? null,
          metadata: null,
        })
        .then(({ error }) => {
          if (error) console.error("ClassicFluency template_events insert failed:", error);
        });
    });
  }, [receiptId]);

  const audit = (run?.analysis_output_json as any) ?? null;
  const runMeta = run
    ? {
        transcript_hash: run.transcript_hash,
        created_at: run.created_at,
        input_type: run.input_type,
        subject_type: run.subject_type,
        receipt_profile: run.receipt_profile,
        tool_metadata: run.tool_metadata,
      }
    : undefined;

  return (
    <LiteracyReceipt
      receipt={receipt}
      audit={audit}
      runMeta={runMeta}
      turns={turns}
      tools={tools}
      recommendations={recommendations ?? null}
      recommendationsLoading={false}
      profile={profile ?? null}
    />
  );
}
