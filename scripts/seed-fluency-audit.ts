/**
 * Seed script for Charlotte Fluency Engine audit (scenarios 23–26).
 *
 * Creates synthetic participants in a dedicated audit session, then drives
 * each one through a scripted sequence of receipts + fluency_analysis_runs
 * with crafted dimension scores. After each receipt it invokes the real
 * updateFluencyProfile() so we can audit the resulting profile rows
 * against expected EMA / activation / responsiveness behavior.
 *
 * Run:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun run scripts/seed-fluency-audit.ts
 *
 * Cleanup:
 *   bun run scripts/seed-fluency-audit.ts --cleanup
 *
 * SAFE: all synthetic users have emails like fluency-audit+<scenario>@charlotte-labs.test
 * and live inside a single dedicated session (name='__fluency_audit__'). The
 * --cleanup flag deletes only those rows.
 */

import { supabaseAdmin } from '../src/integrations/supabase/client.server';
import { updateFluencyProfile } from '../src/server/fluency-profile.server';

const AUDIT_SESSION_NAME = '__fluency_audit__';
const EMAIL_PREFIX = 'fluency-audit+';
const EMAIL_DOMAIN = '@charlotte-labs.test';

const PROFILE_DIMS = [
  'direction', 'delegation', 'discernment', 'development',
  'ethics', 'efficiency', 'strategic_agency',
] as const;

type DimScores = Partial<Record<(typeof PROFILE_DIMS)[number] | 'capital_stewardship', number>>;

interface Scenario {
  key: string;          // suffix in email + display
  label: string;
  receipts: Array<{ scores: DimScores; basis?: 'direct_evidence' | 'inferred_evidence' | 'not_enough' }>;
  expect: string;       // human-readable expectation for the audit reader
}

// ---------------------------------------------------------------------------
// Scenarios (23–26 from the QA prompt)
// ---------------------------------------------------------------------------
const SCENARIOS: Scenario[] = [
  {
    key: 'power-user',
    label: 'S23 — Power user, 5 strong receipts in a week',
    receipts: Array.from({ length: 5 }, () => ({
      scores: Object.fromEntries(PROFILE_DIMS.map(d => [d, 4.2])) as DimScores,
      basis: 'direct_evidence' as const,
    })),
    expect: 'After 5 receipts: receipt_count_total=5, all profile scores ~4.2, confidence rising toward 0.75.',
  },
  {
    key: 'skeptic-improver',
    label: 'S24 — Skeptical exec who improves over 6 receipts',
    receipts: [
      { scores: { direction: 2.0, delegation: 2.2, discernment: 2.0, development: 2.1, ethics: 3.0, efficiency: 2.3, strategic_agency: 2.0 }, basis: 'direct_evidence' },
      { scores: { direction: 2.4, delegation: 2.6, discernment: 2.3, development: 2.5, ethics: 3.1, efficiency: 2.6, strategic_agency: 2.3 }, basis: 'direct_evidence' },
      { scores: { direction: 2.9, delegation: 3.0, discernment: 2.8, development: 3.0, ethics: 3.3, efficiency: 3.0, strategic_agency: 2.8 }, basis: 'direct_evidence' },
      { scores: { direction: 3.4, delegation: 3.4, discernment: 3.3, development: 3.4, ethics: 3.6, efficiency: 3.5, strategic_agency: 3.3 }, basis: 'direct_evidence' },
      { scores: { direction: 3.8, delegation: 3.8, discernment: 3.7, development: 3.9, ethics: 3.9, efficiency: 4.0, strategic_agency: 3.7 }, basis: 'direct_evidence' },
      { scores: { direction: 4.2, delegation: 4.2, discernment: 4.1, development: 4.2, ethics: 4.2, efficiency: 4.3, strategic_agency: 4.1 }, basis: 'direct_evidence' },
    ],
    expect: 'Profile direction should climb from ~2.0 to ~3.5+ — verifies engine actually moves under sustained improvement.',
  },
  {
    key: 'team-lead-mixed',
    label: 'S25 — Team lead, mixed quality (good/bad/good)',
    receipts: [
      { scores: { direction: 4.0, delegation: 4.0, discernment: 3.8, development: 4.0, ethics: 3.8, efficiency: 4.1, strategic_agency: 3.9 }, basis: 'direct_evidence' },
      { scores: { direction: 2.0, delegation: 2.1, discernment: 1.9, development: 2.0, ethics: 2.5, efficiency: 2.2, strategic_agency: 1.8 }, basis: 'direct_evidence' },
      { scores: { direction: 4.1, delegation: 4.0, discernment: 4.0, development: 4.1, ethics: 4.0, efficiency: 4.2, strategic_agency: 4.0 }, basis: 'direct_evidence' },
      { scores: { direction: 2.2, delegation: 2.0, discernment: 2.1, development: 2.0, ethics: 2.6, efficiency: 2.3, strategic_agency: 2.0 }, basis: 'direct_evidence' },
    ],
    expect: 'Profile should hover near the weighted mean (~3.0). Tests EMA stability under noisy input.',
  },
  {
    key: 'returning-idle',
    label: 'S26 — Returning user with one strong receipt after long idle',
    receipts: [
      { scores: { direction: 4.5, delegation: 4.5, discernment: 4.4, development: 4.5, ethics: 4.3, efficiency: 4.5, strategic_agency: 4.4 }, basis: 'direct_evidence' },
    ],
    expect: 'Single receipt → profile = run scores exactly (priorWeight=0). receipt_count_total=1.',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOrCreateAuditSession(): Promise<string> {
  // Need a researcher to own the session — pick first admin/researcher.
  const { data: roleRow } = await supabaseAdmin
    .from('user_roles')
    .select('user_id')
    .in('role', ['researcher', 'admin'])
    .limit(1)
    .maybeSingle();
  const researcherId = roleRow?.user_id;
  if (!researcherId) throw new Error('No researcher/admin user found to own audit session.');

  const { data: existing } = await supabaseAdmin
    .from('research_sessions')
    .select('id')
    .eq('name', AUDIT_SESSION_NAME)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created, error } = await supabaseAdmin
    .from('research_sessions')
    .insert({
      name: AUDIT_SESSION_NAME,
      description: 'Synthetic users for fluency engine audit. Safe to delete.',
      researcher_id: researcherId,
      status: 'active',
      kind: 'research',
      consent_text: 'Audit harness — no real participants.',
      join_code: 'AUDIT-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    } as any)
    .select('id')
    .single();
  if (error) throw error;
  return created!.id;
}

async function getOrCreateParticipant(scenarioKey: string): Promise<string> {
  const email = `${EMAIL_PREFIX}${scenarioKey}${EMAIL_DOMAIN}`;
  // Try to find existing
  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = list?.users.find(u => u.email === email);
  if (found) return found.id;

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { display_name: `Audit ${scenarioKey}` },
  });
  if (error) throw error;
  return data.user!.id;
}

async function ensureMembership(sessionId: string, participantId: string) {
  await supabaseAdmin
    .from('session_participants')
    .upsert(
      { session_id: sessionId, participant_id: participantId, consent_accepted_at: new Date().toISOString() } as any,
      { onConflict: 'session_id,participant_id' },
    );
}

function buildAnalysisOutput(scores: DimScores, basis: string) {
  return {
    dimensions: Object.entries(scores).map(([canonical_name, score]) => ({
      canonical_name,
      score,
      evidence_basis: basis,
      display_name: canonical_name,
      explanation: 'Synthetic audit data',
      evidence_snippets: [],
    })),
  };
}

async function insertReceiptAndRun(
  participantId: string,
  sessionId: string,
  scores: DimScores,
  basis: string,
): Promise<string> {
  const { data: r, error: rErr } = await supabaseAdmin
    .from('receipts')
    .insert({
      participant_id: participantId,
      session_id: sessionId,
      tool_used: 'chatgpt',
      conversation_json: [],
      metadata: { audit: true },
    } as any)
    .select('id')
    .single();
  if (rErr) throw rErr;
  const receiptId = r!.id as string;

  const { error: runErr } = await supabaseAdmin
    .from('fluency_analysis_runs')
    .insert({
      receipt_id: receiptId,
      participant_id: participantId,
      session_id: sessionId,
      transcript_consent: false,
      analysis_output_json: buildAnalysisOutput(scores, basis),
      rubric_version: 'v1',
    } as any);
  if (runErr) throw runErr;

  return receiptId;
}

async function readProfile(participantId: string, sessionId: string) {
  const { data } = await supabaseAdmin
    .from('participant_fluency_profiles')
    .select('receipt_count_total, direction_score_profile, delegation_score_profile, discernment_score_profile, development_score_profile, ethics_score_profile, efficiency_score_profile, strategic_agency_score_profile, direction_confidence')
    .eq('participant_id', participantId)
    .eq('session_id', sessionId)
    .maybeSingle();
  return data;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
async function cleanup() {
  console.log('🧹 Cleanup: removing audit session + synthetic participants...');
  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const auditUsers = (list?.users ?? []).filter(u => u.email?.startsWith(EMAIL_PREFIX) && u.email?.endsWith(EMAIL_DOMAIN));
  const ids = auditUsers.map(u => u.id);

  const { data: sess } = await supabaseAdmin.from('research_sessions').select('id').eq('name', AUDIT_SESSION_NAME).maybeSingle();
  if (sess?.id) {
    await supabaseAdmin.from('participant_fluency_history').delete().eq('session_id', sess.id);
    await supabaseAdmin.from('participant_fluency_profiles').delete().eq('session_id', sess.id);
    await supabaseAdmin.from('fluency_analysis_runs').delete().eq('session_id', sess.id);
    await supabaseAdmin.from('receipts').delete().eq('session_id', sess.id);
    await supabaseAdmin.from('session_participants').delete().eq('session_id', sess.id);
    await supabaseAdmin.from('research_sessions').delete().eq('id', sess.id);
  }
  for (const uid of ids) {
    try { await supabaseAdmin.auth.admin.deleteUser(uid); } catch (e) { console.warn('  user delete failed', uid, e); }
  }
  console.log(`✅ Removed ${ids.length} synthetic users + audit session.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--cleanup')) {
    await cleanup();
    return;
  }

  console.log('🌱 Seeding fluency audit scenarios...\n');
  const sessionId = await getOrCreateAuditSession();
  console.log(`Session: ${sessionId}\n`);

  for (const scenario of SCENARIOS) {
    console.log(`\n=== ${scenario.label} ===`);
    console.log(`Expect: ${scenario.expect}`);
    const participantId = await getOrCreateParticipant(scenario.key);
    await ensureMembership(sessionId, participantId);
    console.log(`Participant: ${participantId}`);

    for (let i = 0; i < scenario.receipts.length; i++) {
      const r = scenario.receipts[i];
      const receiptId = await insertReceiptAndRun(participantId, sessionId, r.scores, r.basis ?? 'direct_evidence');
      await updateFluencyProfile(receiptId, participantId, sessionId);
      const p = await readProfile(participantId, sessionId);
      console.log(`  receipt ${i + 1}/${scenario.receipts.length} → count=${p?.receipt_count_total} dir=${p?.direction_score_profile?.toFixed(3)} conf=${p?.direction_confidence?.toFixed(3)}`);
    }

    const final = await readProfile(participantId, sessionId);
    console.log(`  FINAL: ${JSON.stringify(final, null, 2)}`);
  }

  console.log('\n✅ Seed complete. Run with --cleanup to remove.');
}

main().catch(e => { console.error(e); process.exit(1); });
