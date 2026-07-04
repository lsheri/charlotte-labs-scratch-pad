import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/**
 * Returns prompt_chains for a specific receipt, ordered by chain creation.
 * Used by the chain timeline on the individual receipt page.
 * Called by: src/components/receipt/LiteracyReceipt.tsx
 */
export const getReceiptChains = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ receiptId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: chains } = await supabase
      .from('prompt_chains')
      .select('id, chain_type, prompt_count, structure_score_trend, resolution_type, first_occurrence_for_participant')
      .eq('receipt_id', data.receiptId)
      .order('created_at', { ascending: true });
    return { chains: chains ?? [] };
  });
