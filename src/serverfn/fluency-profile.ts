import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/**
 * Returns the current fluency profile for the authenticated participant.
 * Used by the participant receipt page to populate the profile layer of the
 * two-series radar (primary web). Returns { profile: null } when no profile
 * row exists yet; the radar then falls back to single-series.
 * Called by: src/routes/participant.receipts.$receiptId.tsx
 */
export const getMyFluencyProfile = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { getParticipantFluencyProfile } = await import(
      '@/server/fluency-profile.server'
    );
    const profile = await getParticipantFluencyProfile(
      context.userId,
      data.sessionId,
    );
    return { profile };
  });

/**
 * Returns participant_tool_history rows for the authenticated participant.
 * Used by the Tool Coverage indicator on the student dashboard.
 * Called by: src/routes/participant.index.tsx
 */
export const getMyToolHistory = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from('participant_tool_history')
      .select('tool, session_count, receipt_count, first_use_date, is_established')
      .eq('participant_id', context.userId);
    return { history: data ?? [] };
  });

/**
 * Cross-session "current fluency" snapshot + last 3 receipts so the dashboard
 * can show an overall radar with click-through receipt overlays.
 *
 * Semantics (defensible to enterprise reviewers):
 * - `overall` is the LATEST participant_fluency_history row's score_profile
 *   values. That is the engine's most recent measurement — not an unweighted
 *   mean across all-time history. Labeled "Latest measurement · {date}" in UI.
 * - Each dimension carries its own confidence (read straight from the same
 *   row's *_confidence columns). The radar dashes spokes with confidence < 0.50 (i.e. any provisional spoke).
 * - Provenance is read from history.provenance (column on the snapshot row),
 *   not joined through receipts.metadata at read time.
 */
const PROFILE_DIMS: Array<{ canonical: string; display: string; col: string; confCol: string }> = [
  { canonical: 'direction',                  display: 'Direction',                    col: 'direction_score_profile',         confCol: 'direction_confidence' },
  { canonical: 'delegation',                 display: 'Delegation',                   col: 'delegation_score_profile',        confCol: 'delegation_confidence' },
  { canonical: 'discernment',                display: 'Discernment',                  col: 'discernment_score_profile',       confCol: 'discernment_confidence' },
  { canonical: 'development',                display: 'Development',                  col: 'development_score_profile',       confCol: 'development_confidence' },
  { canonical: 'ethics_data_responsibility', display: 'Ethics & Data Responsibility', col: 'ethics_score_profile',            confCol: 'ethics_confidence' },
  { canonical: 'efficiency_leverage',        display: 'Efficiency & Leverage',        col: 'efficiency_score_profile',        confCol: 'efficiency_confidence' },
  { canonical: 'strategic_agency',           display: 'Strategic Agency',             col: 'strategic_agency_score_profile',  confCol: 'strategic_agency_confidence' },
];

// Per-dimension cumulative rule (C-median):
//   For each dimension, look at the most recent history rows that measured
//   it with confidence >= MIN_CONF. Take the median of the most recent N
//   such measurements. < 2 qualifying = provisional. 0 = null (dashed spoke).
//
// Why median: robust to one anomalous receipt (e.g. a polished workflow that
// doesn't reflect typical practice). One outlier gets sandwiched between two
// honest measurements and ignored. Two anomalies in a row start to count —
// which is correct: at that point it's a pattern, not noise.
//
// Why N=3: small enough that recent behavior change shows up within a week
// of real use; large enough that no single receipt can swing the radar.
const MIN_CONF = 0.5;
const WINDOW_N = 3;

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export const getMyOverallFluencySnapshot = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    // Full chronological history — one read, no AI calls.
    const cols = ['receipt_id', 'created_at', 'provenance']
      .concat(PROFILE_DIMS.flatMap(d => [d.col, d.confCol]))
      .join(', ');
    const { data: historyRows } = await supabase
      .from('participant_fluency_history' as any)
      .select(cols)
      .eq('participant_id', context.userId)
      .order('created_at', { ascending: true });
    const history = (historyRows ?? []) as any[];

    // C-median: per dimension, walk history newest → oldest, collect up to
    // WINDOW_N rows where the dimension was measured at confidence >= MIN_CONF.
    const reversed = [...history].reverse();
    const overall = PROFILE_DIMS.map(d => {
      const contributing: Array<{ value: number; receiptId: string; createdAt: string; confidence: number }> = [];
      for (const row of reversed) {
        const v = row[d.col];
        const c = row[d.confCol];
        if (typeof v === 'number' && typeof c === 'number' && c >= MIN_CONF) {
          contributing.push({ value: v, receiptId: row.receipt_id, createdAt: row.created_at, confidence: c });
          if (contributing.length >= WINDOW_N) break;
        }
      }
      const value = contributing.length >= 1 ? median(contributing.map(c => c.value)) : null;
      const provisional = contributing.length === 1;
      const avgConf = contributing.length
        ? contributing.reduce((s, c) => s + c.confidence, 0) / contributing.length
        : null;
      return {
        canonical: d.canonical,
        label: d.display,
        value,
        // Provisional spokes render dashed so the eye sees "not yet trusted".
        confidence: provisional ? Math.min(avgConf ?? 0, MIN_CONF - 0.01) : avgConf,
        sampleCount: contributing.length,
        provisional,
        contributing: contributing.map(c => ({ receiptId: c.receiptId, createdAt: c.createdAt, value: c.value })),
      };
    });
    const latest = history.length ? history[history.length - 1] : null;
    const latestAt = latest?.created_at ?? null;
    const hasData = history.length > 0;

    // Last 3 receipts for the overlay cycler
    const recent = [...history].slice(-3).reverse();

    // Provenance now lives on the history row directly. We still hydrate
    // receipt label + tool from the receipts table for chip display.
    const recentIds = recent.map(h => h.receipt_id).filter(Boolean) as string[];
    const labelsMap = new Map<string, { tool: string; label: string | null }>();
    if (recentIds.length) {
      const { data: rs } = await supabase
        .from('receipts')
        .select('id, tool_used, metadata')
        .in('id', recentIds);
      (rs ?? []).forEach(r => {
        const md = ((r as any).metadata ?? {}) as { label?: string | null };
        labelsMap.set(r.id, {
          tool: (r as any).tool_used,
          label: md.label ?? null,
        });
      });
    }

    // Provenance mix across ALL history (drives the lab/personal footer).
    const provenanceMix = { lab: 0, personal: 0, total: history.length };
    history.forEach(h => {
      if (h.provenance === 'lab') provenanceMix.lab++; else provenanceMix.personal++;
    });

    // Pull evidence snippets (per-dimension explanations) from the latest
    // analysis run per receipt, and any cached recommendations. These power
    // the right-side "highlights / next moves" panel — no raw numbers shown.
    const evidenceByReceipt = new Map<string, Array<{ dimension: string; snippet: string; score: number }>>();
    if (recentIds.length) {
      const { data: runs } = await supabase
        .from('fluency_analysis_runs')
        .select('receipt_id, created_at, analysis_output_json')
        .in('receipt_id', recentIds)
        .order('created_at', { ascending: false });
      (runs ?? []).forEach((r: any) => {
        if (evidenceByReceipt.has(r.receipt_id)) return; // newest run only
        const dims = (r.analysis_output_json?.dimensions ?? []) as any[];
        const picks = dims
          .filter(d => Array.isArray(d.evidence_snippets) && d.evidence_snippets.length > 0)
          .map(d => ({
            dimension: d.display_name ?? d.canonical_name ?? 'Dimension',
            snippet: String(d.evidence_snippets[0]).replace(/^["“]|["”]$/g, '').trim(),
            score: typeof d.score === 'number' ? d.score : 0,
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);
        evidenceByReceipt.set(r.receipt_id, picks);
      });
    }

    const recsByReceipt = new Map<string, Array<{ title: string; body: string; dimension: string | null }>>();
    if (recentIds.length) {
      const { data: recRows } = await supabase
        .from('receipt_recommendations_cache')
        .select('receipt_id, payload, created_at')
        .in('receipt_id', recentIds)
        .order('created_at', { ascending: false });
      (recRows ?? []).forEach((r: any) => {
        if (recsByReceipt.has(r.receipt_id)) return;
        const list = (r.payload?.recommendations ?? []) as any[];
        recsByReceipt.set(
          r.receipt_id,
          list.slice(0, 2).map(rec => ({
            title: String(rec.title ?? 'Try this'),
            body: String(rec.body ?? ''),
            dimension: rec.dimension ?? null,
          })),
        );
      });
    }

    const receipts = recent.map((row) => {
      const chronoIdx = history.findIndex(h => h.receipt_id === row.receipt_id);
      const prior = chronoIdx > 0 ? history[chronoIdx - 1] : null;
      const meta = labelsMap.get(row.receipt_id);
      const prov: 'lab' | 'personal' = row.provenance === 'lab' ? 'lab' : 'personal';
      return {
        receiptId: row.receipt_id as string,
        createdAt: row.created_at as string,
        tool: meta?.tool ?? null,
        label: meta?.label ?? null,
        provenance: prov,
        provenanceSource: null as string | null,
        // null when the row didn't measure that dimension — UI renders "—".
        after: PROFILE_DIMS.map(d => ({
          canonical: d.canonical,
          label: d.display,
          value: typeof row[d.col] === 'number' ? row[d.col] : null,
        })),
        before: PROFILE_DIMS.map(d => ({
          canonical: d.canonical,
          label: d.display,
          value: prior && typeof prior[d.col] === 'number' ? prior[d.col] : null,
        })),
        hasPrior: !!prior,
        evidence: evidenceByReceipt.get(row.receipt_id) ?? [],
        recommendations: recsByReceipt.get(row.receipt_id) ?? [],
      };
    });

    // Compact series for the scrubber (only useful with ≥4 snapshots).
    const timeline = history.map(h => ({
      receiptId: h.receipt_id as string,
      createdAt: h.created_at as string,
      dimensions: PROFILE_DIMS.map(d => ({
        canonical: d.canonical,
        label: d.display,
        value: typeof h[d.col] === 'number' ? h[d.col] : null,
      })),
    }));

    return {
      overall,
      latestAt,
      hasData,
      receipts,
      timeline,
      sampleSize: history.length,
      provenanceMix,
    };
  });
