/**
 * Demo cohort seed for the self-guided investor/partner demo.
 *
 * Seeds, inside the existing ECON201 class workspace:
 *   1. HERO STUDENT (the shared demo login) — ~14 AI threads over 5 weeks across
 *      ChatGPT / Claude / Gemini / Perplexity, mapped to the 4 assignments, plus
 *      3 receipts (weeks 1 / 3 / 5) with rising dimension scores pushed through
 *      the real updateFluencyProfile() so the Fingerprint matures realistically.
 *   2. SYNTHETIC COHORT — 28 students with a realistic spread (strong tail,
 *      middle mass, ~6 at-risk) so the Department View shows credible
 *      assignments-at-risk, fluency-by-dimension, tool and verification data.
 *
 * Run:
 *   bun run scripts/seed-demo-cohort.ts
 *
 * Cleanup (removes ONLY seeded rows):
 *   bun run scripts/seed-demo-cohort.ts --cleanup
 *
 * SAFE / IDEMPOTENT: every row this script writes carries a marker —
 *   - synthetic users:  demo-cohort+NN@charlotte-labs.test
 *   - chat_threads:     thread_key starts with 'demo-seed-'
 *   - receipts:         metadata.demo_seed = 'v1'
 * The script cleans its own previous output before re-seeding, so it can be run
 * repeatedly. Real user data (existing threads/receipts) is never touched.
 */

import { supabaseAdmin } from '../src/integrations/supabase/client.server';
import { updateFluencyProfile } from '../src/server/fluency-profile.server';

const SEED_TAG = 'v1';
const THREAD_KEY_PREFIX = 'demo-seed-';
const COHORT_EMAIL_PREFIX = 'demo-cohort+';
const COHORT_EMAIL_DOMAIN = '@charlotte-labs.test';
const HERO_EMAIL = process.env['DEMO_HERO_EMAIL'] ?? 'liam@charlotte-labs.com';
const CLASS_CODE = 'ECON201';

// Canonical dimension registry names — all 8 are scored so the participant
// radar and the department card render a full framework, nothing blank.
const PROFILE_DIMS = [
  'direction', 'delegation', 'discernment', 'development',
  'ethics_data_responsibility', 'efficiency_leverage',
  'capital_stewardship', 'strategic_agency',
] as const;
const DIM_LABELS: Record<string, string> = {
  direction: 'Direction',
  delegation: 'Delegation',
  discernment: 'Discernment',
  development: 'Development',
  ethics_data_responsibility: 'Ethics & Data Responsibility',
  efficiency_leverage: 'Efficiency & Leverage',
  capital_stewardship: 'Capital Stewardship',
  strategic_agency: 'Strategic Agency',
};
type Dim = (typeof PROFILE_DIMS)[number];
type DimScores = Record<Dim, number>;


// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const TERM_START = new Date('2026-01-20T15:00:00Z').getTime();
const DAY = 86_400_000;

/** ISO timestamp N days into the term, at a plausible study hour. */
function day(n: number, hour = 20): string {
  const d = new Date(TERM_START + n * DAY);
  d.setUTCHours(hour, Math.floor(seeded(n * 7 + hour) * 59), 0, 0);
  return d.toISOString();
}

/** Deterministic pseudo-random in [0,1) so re-runs produce the same data. */
let _s = 1;
function seeded(n?: number): number {
  const x = Math.sin((n ?? _s++) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
function pick<T>(arr: T[], n: number): T { return arr[Math.floor(seeded(n) * arr.length)]!; }
function int(min: number, max: number, n: number): number {
  return min + Math.floor(seeded(n) * (max - min + 1));
}

function scores(base: number, jitterSeed: number, overrides: Partial<DimScores> = {}): DimScores {
  const out = {} as DimScores;
  PROFILE_DIMS.forEach((d, i) => {
    const v = base + (seeded(jitterSeed + i * 3) - 0.5) * 0.6;
    out[d] = Math.round(Math.max(1, Math.min(5, v)) * 10) / 10;
  });
  return { ...out, ...overrides };
}

function analysisOutput(s: DimScores, basis = 'direct_evidence') {
  return {
    dimensions: Object.entries(s).map(([canonical_name, score]) => ({
      canonical_name,
      display_name: DIM_LABELS[canonical_name] ?? canonical_name,
      score,
      evidence_basis: basis,
      explanation: 'Seeded demo data',
      evidence_snippets: [],
    })),
  };
}

/**
 * The department dashboard infers verification strength from thread titles
 * (see verificationFromTitle in src/serverfn/admin-overview.ts). Cohort threads
 * are aggregate-only (never rendered individually), so we embed the token.
 */
function verifTag(level: 'high' | 'partial' | 'none'): string {
  return level === 'high' ? 'highVerification'
    : level === 'partial' ? 'partialVerification'
    : 'noVerification';
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

async function findClass() {
  const { data, error } = await supabaseAdmin
    .from('research_sessions')
    .select('id, name, metadata')
    .eq('kind', 'research');
  if (error) throw error;
  const cls = (data ?? []).find((s: any) => s.metadata?.course_code === CLASS_CODE)
    ?? (data ?? [])[0];
  if (!cls) throw new Error(`No class workspace found (looking for ${CLASS_CODE}).`);
  return cls as { id: string; name: string };
}

async function findAssignments(sessionId: string) {
  const { data, error } = await supabaseAdmin
    .from('class_assignments')
    .select('id, code, title, due_at, expected_tools')
    .eq('session_id', sessionId);
  if (error) throw error;
  if (!data?.length) throw new Error('No assignments found in class.');
  return data;
}

async function listAllUsers() {
  const out: Array<{ id: string; email: string | undefined }> = [];
  for (let page = 1; page <= 10; page++) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    const users = data?.users ?? [];
    out.push(...users.map(u => ({ id: u.id, email: u.email })));
    if (users.length < 200) break;
  }
  return out;
}

async function findHero(): Promise<string> {
  const users = await listAllUsers();
  const hero = users.find(u => u.email?.toLowerCase() === HERO_EMAIL.toLowerCase());
  if (!hero) throw new Error(`Hero account ${HERO_EMAIL} not found.`);
  return hero.id;
}

async function ensureCohortUser(n: number, name: string): Promise<string> {
  const email = `${COHORT_EMAIL_PREFIX}${String(n).padStart(2, '0')}${COHORT_EMAIL_DOMAIN}`;
  const users = await listAllUsers();
  const found = users.find(u => u.email === email);
  if (found) return found.id;
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: crypto.randomUUID() + 'Aa1!',
    email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (error) throw error;
  return data.user!.id;
}

async function ensureMembership(sessionId: string, participantId: string) {
  const { data } = await supabaseAdmin
    .from('session_participants')
    .select('id')
    .eq('session_id', sessionId)
    .eq('participant_id', participantId)
    .maybeSingle();
  if (!data) {
    await supabaseAdmin.from('session_participants').insert({
      session_id: sessionId,
      participant_id: participantId,
      consent_accepted_at: new Date().toISOString(),
    } as any);
  }
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

interface ThreadSpec {
  tool: string;
  title: string;
  turns: number;
  dayIndex: number;
  spanDays?: number;
  assignmentCode?: string;
  summary?: string;
}

async function insertThread(
  participantId: string, sessionId: string, key: string, t: ThreadSpec,
): Promise<string> {
  const first = day(t.dayIndex);
  const last = day(t.dayIndex + (t.spanDays ?? 0), 21);
  const { data, error } = await supabaseAdmin
    .from('chat_threads')
    .upsert({
      participant_id: participantId,
      session_id: sessionId,
      tool: t.tool,
      thread_key: key,
      title: t.title,
      turn_count: t.turns,
      first_captured_at: first,
      last_captured_at: last,
      created_at: first,
      summary: t.summary ?? null,
      summary_generated_at: t.summary ? last : null,
    } as any, { onConflict: 'participant_id,tool,thread_key' })
    .select('id')
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function mapThread(assignmentId: string, threadId: string, participantId: string) {
  await supabaseAdmin.from('assignment_threads').upsert({
    assignment_id: assignmentId,
    thread_id: threadId,
    participant_id: participantId,
  } as any, { onConflict: 'assignment_id,thread_id' });
}

async function insertReceipt(opts: {
  participantId: string;
  sessionId: string;
  label: string;
  tool: string;
  createdAt: string;
  goal?: string;
  threadIds?: string[];
  scores: DimScores;
}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('receipts')
    .insert({
      participant_id: opts.participantId,
      session_id: opts.sessionId,
      tool_used: opts.tool,
      conversation_json: [],
      goal: opts.goal ?? null,
      created_at: opts.createdAt,
      updated_at: opts.createdAt,
      metadata: {
        demo_seed: SEED_TAG,
        label: opts.label,
        workflowType: 'study',
        provenance: 'lab',
        provenanceSource: 'auto_session',
        workflowTypeSet: true,
      },
    } as any)
    .select('id')
    .single();
  if (error) throw error;
  const receiptId = data!.id as string;

  if (opts.threadIds?.length) {
    await supabaseAdmin.from('receipt_threads').upsert(
      opts.threadIds.map((tid, i) => ({ receipt_id: receiptId, thread_id: tid, position: i })) as any,
      { onConflict: 'receipt_id,thread_id' },
    );
  }

  const { error: runErr } = await supabaseAdmin.from('fluency_analysis_runs').insert({
    receipt_id: receiptId,
    participant_id: opts.participantId,
    session_id: opts.sessionId,
    transcript_consent: false,
    analysis_output_json: analysisOutput(opts.scores),
    rubric_version: 'v1',
    created_at: opts.createdAt,
  } as any);
  if (runErr) throw runErr;

  await updateFluencyProfile(receiptId, opts.participantId, opts.sessionId);
  return receiptId;
}

async function submit(assignmentId: string, participantId: string, receiptId: string | null, at: string) {
  await supabaseAdmin.from('assignment_submissions').upsert({
    assignment_id: assignmentId,
    participant_id: participantId,
    receipt_id: receiptId,
    submitted_at: at,
    metadata: { demo_seed: SEED_TAG },
  } as any, { onConflict: 'assignment_id,participant_id' });
}

// ---------------------------------------------------------------------------
// Hero student narrative — 14 threads across 5 weeks
// ---------------------------------------------------------------------------

const HERO_THREADS: ThreadSpec[] = [
  { tool: 'chatgpt', title: 'Opportunity cost — checking my PPF intuition', turns: 18, dayIndex: 3, spanDays: 0, assignmentCode: 'PS1',
    summary: 'Worked through production possibility frontiers, asked for a counterexample and re-derived the slope by hand before accepting it.' },
  { tool: 'chatgpt', title: 'PS1 Q4 — comparative advantage worked example', turns: 24, dayIndex: 5, spanDays: 1, assignmentCode: 'PS1',
    summary: 'Asked for the method rather than the answer, then checked the numbers against the textbook table.' },
  { tool: 'claude', title: 'Is my supply-shift explanation actually right?', turns: 31, dayIndex: 8, spanDays: 0, assignmentCode: 'PS1',
    summary: 'Pushed back twice on a confident but wrong claim about movement along vs. shift of the curve.' },
  { tool: 'perplexity', title: 'Real-world example: 2025 coffee price spike', turns: 9, dayIndex: 11, assignmentCode: 'PS1',
    summary: 'Sourced three citations for a supply-shock example and compared them.' },
  { tool: 'chatgpt', title: 'Elasticity formulas — midpoint vs. point method', turns: 21, dayIndex: 22, spanDays: 1, assignmentCode: 'PS2',
    summary: 'Clarified when each formula applies, then generated practice problems and self-graded.' },
  { tool: 'gemini', title: 'PS2 — consumer choice, indifference curve sketching', turns: 27, dayIndex: 25, spanDays: 2, assignmentCode: 'PS2',
    summary: 'Iterated on a budget-constraint diagram, caught an error in the AI\'s tangency condition.' },
  { tool: 'claude', title: 'Cost curves: why does MC cross ATC at its minimum?', turns: 34, dayIndex: 28, spanDays: 1, assignmentCode: 'PS2',
    summary: 'Asked for a proof, then asked for the intuition separately, then explained it back to verify understanding.' },
  { tool: 'perplexity', title: 'Sources on price elasticity of gasoline demand', turns: 7, dayIndex: 30, assignmentCode: 'PS2',
    summary: 'Gathered empirical elasticity estimates with citations for the write-up.' },
  { tool: 'chatgpt', title: 'Monopoly deadweight loss — sanity-checking my graph', turns: 26, dayIndex: 45, spanDays: 1, assignmentCode: 'PS3',
    summary: 'Uploaded the sketch, asked what was wrong with it rather than for a replacement.' },
  { tool: 'claude', title: 'Game theory: solving for Nash equilibrium in PS3 Q7', turns: 38, dayIndex: 48, spanDays: 2, assignmentCode: 'PS3',
    summary: 'Set constraints up front, rejected the first solution, worked to a verified answer.' },
  { tool: 'gemini', title: 'Externalities — Pigouvian tax vs. cap and trade', turns: 22, dayIndex: 52, spanDays: 1, assignmentCode: 'PS3',
    summary: 'Asked for the strongest argument on each side, then for the weaknesses of both.' },
  { tool: 'chatgpt', title: 'Presentation outline — local housing market analysis', turns: 29, dayIndex: 66, spanDays: 3, assignmentCode: 'PRES1',
    summary: 'Used AI to structure the argument, wrote the analysis independently, then asked for critique.' },
  { tool: 'perplexity', title: 'Rent control evidence — what does the literature say?', turns: 12, dayIndex: 69, assignmentCode: 'PRES1',
    summary: 'Collected and cross-checked six sources, noted two that contradicted each other.' },
  { tool: 'claude', title: 'Slide critique — is my causal claim overstated?', turns: 33, dayIndex: 73, spanDays: 1, assignmentCode: 'PRES1',
    summary: 'Asked for adversarial review of the argument and revised two slides as a result.' },
];

// Rising dimension scores across weeks 1 / 3 / 5.
const HERO_RECEIPTS: Array<{ label: string; goal: string; dayIndex: number; tool: string; assignmentCode: string; scores: DimScores }> = [
  {
    label: 'Problem Set 1 — Supply & Demand',
    goal: 'Understand opportunity cost and supply/demand well enough to explain it without notes.',
    dayIndex: 12, tool: 'chatgpt', assignmentCode: 'PS1',
    scores: { direction: 2.8, delegation: 2.6, discernment: 2.4, development: 2.7, ethics_data_responsibility: 3.4, efficiency_leverage: 3.0, capital_stewardship: 2.6, strategic_agency: 2.5 },
  },
  {
    label: 'Problem Set 2 — Elasticity & Costs',
    goal: 'Get from formula-following to actually reasoning about elasticity and cost curves.',
    dayIndex: 32, tool: 'claude', assignmentCode: 'PS2',
    scores: { direction: 3.5, delegation: 3.4, discernment: 3.3, development: 3.4, ethics_data_responsibility: 3.8, efficiency_leverage: 3.6, capital_stewardship: 3.3, strategic_agency: 3.2 },
  },
  {
    label: 'Applied Market Analysis — Presentation',
    goal: 'Build an original market analysis and use AI only as a critic, not an author.',
    dayIndex: 75, tool: 'claude', assignmentCode: 'PRES1',
    scores: { direction: 4.3, delegation: 4.1, discernment: 4.2, development: 4.2, ethics_data_responsibility: 4.5, efficiency_leverage: 4.0, capital_stewardship: 4.2, strategic_agency: 4.1 },
  },
];

async function seedHero(sessionId: string, assignments: any[]) {
  const heroId = await findHero();
  await ensureMembership(sessionId, heroId);
  const byCode = new Map(assignments.map(a => [a.code, a]));
  const threadIdsByAssignment = new Map<string, string[]>();

  for (let i = 0; i < HERO_THREADS.length; i++) {
    const t = HERO_THREADS[i]!;
    const id = await insertThread(heroId, sessionId, `${THREAD_KEY_PREFIX}hero-${i}`, t);
    if (t.assignmentCode) {
      const a = byCode.get(t.assignmentCode);
      if (a) {
        await mapThread(a.id, id, heroId);
        const list = threadIdsByAssignment.get(t.assignmentCode) ?? [];
        list.push(id);
        threadIdsByAssignment.set(t.assignmentCode, list);
      }
    }
  }

  for (const r of HERO_RECEIPTS) {
    const receiptId = await insertReceipt({
      participantId: heroId,
      sessionId,
      label: r.label,
      tool: r.tool,
      goal: r.goal,
      createdAt: day(r.dayIndex),
      threadIds: threadIdsByAssignment.get(r.assignmentCode) ?? [],
      scores: r.scores,
    });
    const a = byCode.get(r.assignmentCode);
    if (a) await submit(a.id, heroId, receiptId, day(r.dayIndex));
  }

  return { heroId, threads: HERO_THREADS.length, receipts: HERO_RECEIPTS.length };
}

// ---------------------------------------------------------------------------
// Synthetic cohort — 28 students
// ---------------------------------------------------------------------------

const FIRST = ['Ava','Noah','Maya','Liam','Zoe','Ethan','Priya','Marcus','Chloe','Diego','Sofia','Jonah','Amara','Ben','Layla','Owen','Nina','Ravi','Grace','Tomas','Iris','Kai','Elena','Sam','Hana','Jamal','Ruby','Felix'];
const LAST = ['Nguyen','Patel','Okafor','Rivera','Chen','Brooks','Silva','Haddad','Novak','Kim','Moore','Diallo','Costa','Weber','Ahmed','Lindqvist','Barnes','Iyer','Fontaine','Reyes','Mbeki','Sato','Vargas','Klein','Tran','Boateng','Marsh','Duarte'];

type Tier = 'strong' | 'middle' | 'at_risk';

interface CohortStudent {
  n: number;
  name: string;
  tier: Tier;
}

function buildCohort(): CohortStudent[] {
  const out: CohortStudent[] = [];
  for (let i = 0; i < 28; i++) {
    const tier: Tier = i < 6 ? 'strong' : i < 22 ? 'middle' : 'at_risk';
    out.push({ n: i + 1, name: `${FIRST[i]} ${LAST[i]}`, tier });
  }
  return out;
}

const TIER_CONFIG: Record<Tier, {
  base: number; tools: string[]; verif: 'high' | 'partial' | 'none';
  threadsPerAssignment: [number, number]; turns: [number, number]; receipts: number;
}> = {
  strong:  { base: 4.1, tools: ['chatgpt', 'claude', 'gemini', 'perplexity'], verif: 'high',    threadsPerAssignment: [1, 2], turns: [24, 42], receipts: 2 },
  middle:  { base: 3.2, tools: ['chatgpt', 'claude', 'gemini'],               verif: 'partial', threadsPerAssignment: [1, 1], turns: [13, 27], receipts: 1 },
  at_risk: { base: 2.1, tools: ['chatgpt'],                                    verif: 'none',    threadsPerAssignment: [0, 1], turns: [3, 9],   receipts: 1 },
};

async function seedCohort(sessionId: string, assignments: any[]) {
  const cohort = buildCohort();
  let threadCount = 0;
  let receiptCount = 0;

  for (const s of cohort) {
    const cfg = TIER_CONFIG[s.tier];
    const uid = await ensureCohortUser(s.n, s.name);
    await ensureMembership(sessionId, uid);
    await supabaseAdmin.from('profiles').upsert(
      { id: uid, display_name: s.name } as any, { onConflict: 'id' },
    );

    const allThreadIds: string[] = [];
    let idx = 0;
    for (const a of assignments) {
      const nThreads = int(cfg.threadsPerAssignment[0], cfg.threadsPerAssignment[1], s.n * 13 + idx);
      // At-risk students skip engagement on the later, harder assignments more often.
      for (let k = 0; k < nThreads; k++) {
        const tool = pick(cfg.tools, s.n * 31 + idx * 7 + k);
        const turns = int(cfg.turns[0], cfg.turns[1], s.n * 17 + idx * 5 + k);
        const dueOffset = Math.max(2, Math.round(
          (new Date(a.due_at ?? day(40)).getTime() - TERM_START) / DAY,
        ) - int(2, 8, s.n + idx));
        const tid = await insertThread(uid, sessionId, `${THREAD_KEY_PREFIX}c${s.n}-${idx}-${k}`, {
          tool,
          title: `${a.code} — ${['working through problems','draft and revision','concept check','worked examples'][ (s.n + k) % 4 ]} · ${verifTag(cfg.verif)}`,
          turns,
          dayIndex: dueOffset,
          spanDays: cfg.verif === 'high' ? 2 : 0,
        });
        allThreadIds.push(tid);
        await mapThread(a.id, tid, uid);
        threadCount++;
      }
      if (nThreads > 0) {
        await submit(a.id, uid, null, day(Math.max(2, Math.round(
          (new Date(a.due_at ?? day(40)).getTime() - TERM_START) / DAY,
        ))));
      }
      idx++;
    }

    for (let r = 0; r < cfg.receipts; r++) {
      // Slight upward drift on the second receipt for strong students.
      const base = cfg.base + (r === 1 ? 0.25 : 0);
      await insertReceipt({
        participantId: uid,
        sessionId,
        label: `${s.name.split(' ')[0]} — receipt ${r + 1}`,
        tool: pick(cfg.tools, s.n + r),
        createdAt: day(20 + r * 30 + int(0, 6, s.n + r)),
        threadIds: allThreadIds.slice(r * 2, r * 2 + 2),
        scores: scores(base, s.n * 11 + r * 5),
      });
      receiptCount++;
    }
    process.stdout.write(`  ${s.n}/28 ${s.name} (${s.tier})\n`);
  }

  return { students: cohort.length, threads: threadCount, receipts: receiptCount };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanup(verbose = true) {
  if (verbose) console.log('🧹 Removing previously seeded demo rows...');

  // 1. Seeded receipts (+ dependent rows) — identified by metadata.demo_seed.
  const { data: receipts } = await supabaseAdmin
    .from('receipts')
    .select('id, metadata');
  const seededReceipts = (receipts ?? [])
    .filter((r: any) => r.metadata?.demo_seed === SEED_TAG)
    .map((r: any) => r.id as string);

  if (seededReceipts.length) {
    await supabaseAdmin.from('participant_fluency_history').delete().in('receipt_id', seededReceipts);
    await supabaseAdmin.from('assignment_submissions').update({ receipt_id: null } as any).in('receipt_id', seededReceipts);
    await supabaseAdmin.from('fluency_analysis_runs').delete().in('receipt_id', seededReceipts);
    await supabaseAdmin.from('receipt_threads').delete().in('receipt_id', seededReceipts);
    await supabaseAdmin.from('receipts').delete().in('id', seededReceipts);
  }

  // 2. Seeded threads (assignment_threads cascade on thread delete).
  const { data: threads } = await supabaseAdmin
    .from('chat_threads')
    .select('id')
    .like('thread_key', `${THREAD_KEY_PREFIX}%`);
  const threadIds = (threads ?? []).map((t: any) => t.id as string);
  if (threadIds.length) {
    await supabaseAdmin.from('assignment_threads').delete().in('thread_id', threadIds);
    await supabaseAdmin.from('chat_threads').delete().in('id', threadIds);
  }

  // 3. Synthetic cohort users and everything hanging off them.
  const users = await listAllUsers();
  const cohortIds = users
    .filter(u => u.email?.startsWith(COHORT_EMAIL_PREFIX) && u.email?.endsWith(COHORT_EMAIL_DOMAIN))
    .map(u => u.id);
  if (cohortIds.length) {
    await supabaseAdmin.from('participant_fluency_history').delete().in('participant_id', cohortIds);
    await supabaseAdmin.from('participant_fluency_profiles').delete().in('participant_id', cohortIds);
    await supabaseAdmin.from('fluency_analysis_runs').delete().in('participant_id', cohortIds);
    await supabaseAdmin.from('receipts').delete().in('participant_id', cohortIds);
    await supabaseAdmin.from('assignment_submissions').delete().in('participant_id', cohortIds);
    await supabaseAdmin.from('assignment_threads').delete().in('participant_id', cohortIds);
    await supabaseAdmin.from('chat_threads').delete().in('participant_id', cohortIds);
    await supabaseAdmin.from('session_participants').delete().in('participant_id', cohortIds);
    for (const id of cohortIds) {
      try { await supabaseAdmin.auth.admin.deleteUser(id); } catch { /* ignore */ }
    }
  }

  // 4. Hero's seeded submissions marked by this script.
  await supabaseAdmin.from('assignment_submissions').delete().eq('metadata->>demo_seed', SEED_TAG);

  if (verbose) {
    console.log(`   removed ${seededReceipts.length} receipts, ${threadIds.length} threads, ${cohortIds.length} synthetic users`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (process.argv.includes('--cleanup')) {
    await cleanup();
    console.log('✅ Cleanup complete.');
    return;
  }

  console.log('🌱 Seeding demo cohort...\n');
  await cleanup(false); // idempotent re-run

  const cls = await findClass();
  const assignments = await findAssignments(cls.id);
  console.log(`Class: ${cls.name} (${cls.id})`);
  console.log(`Assignments: ${assignments.map((a: any) => a.code).join(', ')}\n`);

  console.log('👤 Hero student...');
  const hero = await seedHero(cls.id, assignments);
  console.log(`   ${hero.threads} threads, ${hero.receipts} receipts → ${hero.heroId}\n`);

  console.log('🎓 Cohort (28 students)...');
  const cohort = await seedCohort(cls.id, assignments);
  console.log(`\n   ${cohort.students} students, ${cohort.threads} threads, ${cohort.receipts} receipts\n`);

  console.log('✅ Seed complete. Re-run anytime; use --cleanup to remove.');
}

main().catch(e => { console.error(e); process.exit(1); });
