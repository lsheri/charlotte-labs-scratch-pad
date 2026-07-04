import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  generateRecommendationsForReceipt,
  type Recommendation,
  type RecommendationsResult,
} from "@/server/recommendations.server";

export type { Recommendation, RecommendationsResult };

export const getFluencyRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ receiptId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<RecommendationsResult> => {
    const { supabase } = context;
    return generateRecommendationsForReceipt({ supabase, receiptId: data.receiptId });
  });
