import { supabaseAdmin } from '@/integrations/supabase/client.server';

/**
 * Deletes all Engine V1 data for a withdrawn participant.
 * Covers all new tables added in Engine V1: prompt_features, prompt_chains,
 * receipt_construct_signals, participant_fluency_profiles,
 * participant_tool_history, participant_baseline.
 * All tables are indexed on participant_id for fast deletion.
 * Called by: withdrawFromStudy() in src/serverfn/study-lifecycle.ts
 * Per spec Part 8b: deletions must complete within 24 hours of withdrawal.
 */
export async function applyWithdrawalCascade(participantId: string): Promise<void> {
  const tables = [
    'prompt_features',
    'prompt_chains',
    'receipt_construct_signals',
    'participant_fluency_profiles',
    'participant_tool_history',
    'participant_baseline',
  ] as const;

  const results = await Promise.allSettled(
    tables.map((table) =>
      supabaseAdmin.from(table).delete().eq('participant_id', participantId),
    ),
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      console.error(
        `[withdrawal-cascade] failed to delete from ${tables[i]}:`,
        result.reason,
      );
    } else if (result.value.error) {
      console.error(
        `[withdrawal-cascade] error deleting from ${tables[i]}:`,
        result.value.error.message,
      );
    }
  }
}
