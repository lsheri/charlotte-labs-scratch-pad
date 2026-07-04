import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const inputSchema = z.object({
  template_key: z.string().min(1).max(64),
  rating: z.enum(["up", "down"]),
  comment: z.string().max(2000).optional().nullable(),
  receipt_id: z.string().uuid(),
});

export const submitTemplateFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("template_demo_feedback")
      .insert({
        user_id: context.userId,
        receipt_id: data.receipt_id,
        template_key: data.template_key,
        rating: data.rating,
        comment: data.comment ?? null,
      });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
