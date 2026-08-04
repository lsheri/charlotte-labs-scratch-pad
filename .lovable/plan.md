# Self-guided investor demo

Goal: a link recipient clicks through the whole product story alone — one workspace, a guided in-app tour, hover explanations everywhere, and believable data behind it.

## 1. One workspace for the demo account

Keep multi-workspace architecture untouched. Configure by data + a demo flag:

- Seed exactly one class workspace (`ECON 201 — Intermediate Microeconomics`) and keep the auto-created Personal workspace, but the demo account joins only the class.
- Add a lightweight `isDemoAccount` signal derived from data, not hardcoded emails: `research_sessions.metadata.demo = true` on the seeded class, surfaced by `listClassSidebar`. When the user has exactly one class and no other consented research workspace, the shell enters "single-workspace mode".
- In single-workspace mode: the "Working in" switcher renders as a static label (class name + course code, no chevron, not clickable) and the `Workspaces` nav item is hidden. Judgment call: hide rather than show-one-option — a picker with one entry invites a click that goes nowhere and reads as unfinished.
- Personal workspace still exists underneath; nothing routes to it, and captures default to the class.

Files: `src/components/participant/ParticipantSidebar.tsx` (conditional switcher/nav), `src/serverfn/assignments.ts` (`listClassSidebar` returns `demo`/`singleWorkspace`), `src/lib/activeWorkspace.ts` (force the single class as active, ignore stale localStorage).

## 2. Guided product tour

A real in-app spotlight tour, not slides. New `src/components/tour/`:

- `TourProvider.tsx` — context holding `active`, `stepIndex`, `start()`, `next()`, `back()`, `exit()`. Persists "tour completed" in localStorage per user. Mounted in `src/routes/participant.tsx` so it survives route changes (the deck's overlay pattern is reused; its keyboard handling and z-layering are the parts worth copying).
- `tourSteps.ts` — the step registry: `{ id, route, targetSelector, title, body, placement, waitFor? }`. Steps declare their route; the provider navigates via `useNavigate` before spotlighting.
- `TourOverlay.tsx` — dimmed backdrop with a cut-out around the measured target rect (`getBoundingClientRect` + `ResizeObserver`), plus a callout card. Non-target clicks are blocked so the viewer can't wander mid-step.
- `TourCallout.tsx` — title, plain-language body, `Back` / `Next` / `Finish`, `Step n of N` progress dots, and a persistent `Exit tour` X on every step. Escape exits from any step; exiting leaves the viewer on the current screen in free-browse mode.
- Targets are marked with `data-tour="<id>"` attributes added to existing elements — no restructuring of the screens.

Proposed sequence (11 steps):

1. Class home — "This is one course. Everything below is scoped to it."
2. Sidebar Threads — what a captured thread is.
3. Extension page — how capture happens (no install required to watch).
4. Threads list — real multi-tool threads over several weeks.
5. One thread detail — turns, tool, verification behavior.
6. Assignment↔thread mapping on the threads screen — how student work ties to coursework.
7. Generate Receipt button — what a receipt is.
8. Receipt view — fluency radar + dimensions with evidence.
9. Receipt over time — second/third receipt showing improvement.
10. Fingerprint page — the longitudinal picture.
11. Department View (`/admin`) — fluency by dimension, assignments at risk, tool breakdown, verification pattern. Final step's CTA is "Explore on your own".

Entry points: a `Take the tour` button in the sidebar next to `Deck`, plus auto-start on first login for the demo account. `WelcomeTourDialog` becomes the tour's launcher (one button: "Start the walkthrough") instead of a static 4-row summary. `PitchDeck` stays as-is, separate.

Judgment call: the tour reads real seeded data rather than mocking screens, so a seed failure degrades the tour. Steps that depend on a specific record resolve their id at tour start and skip gracefully if missing.

## 3. Hover info affordances

Add `src/components/ui/InfoHint.tsx` — a small `Info` icon button wrapping the existing `Tooltip`, consistent size/placement, `aria-label` from the text, and tap-to-open on touch. Copy lives in one map (`src/lib/hintCopy.ts`) so wording is reviewable in one place.

Needs hints added:
- `src/routes/admin.tsx` — all 5 KPI cards, Fluency-by-dimension card header + each dimension row, Assignments at risk (risk score, risk drivers, tools covered), Tool breakdown, Verification pattern, the demo-cohort chip.
- `src/routes/participant.index.tsx` — home summary cards.
- `src/routes/participant.threads.index.tsx` — assignment column, mapping lines, Generate Receipt button, turn counts.
- `src/routes/participant.receipts.$receiptId.tsx` + `src/components/receipt/FluencyRadarChart.tsx`, `DimensionEvidenceCard.tsx`, `PatternsCard.tsx`, `ChainTimeline.tsx` — what each dimension means, what evidence strength means.
- `src/routes/participant.fingerprint.tsx`, `src/components/participant/OverallFluencyCard.tsx` (partly covered), `ToolCoverageRow.tsx`.
- `src/routes/participant.extension.tsx` — health dot meaning.
- `src/components/provenance/ProvenanceVial.tsx` — lab vs personal.

Already fine: sidebar (collapsed tooltips), `participant.workspaces.tsx`, `OverallFluencyCard` (has some).

## 4. Demo data

New script `scripts/seed-demo-cohort.ts`, following the `seed-fluency-audit.ts` conventions (service-role admin client, dedicated marker, `--cleanup` flag).

- Marker: class session `metadata.demo_seed = 'v1'`; synthetic students use `demo-cohort+<n>@charlotte-labs.test`. Cleanup deletes only rows tied to that session id and those emails, so it is safe to re-run (script is idempotent: it cleans then re-seeds).
- Hero student (the demo login account, joined to the seeded class): ~14 threads across ChatGPT / Claude / Gemini / Perplexity spread over 5 weeks, varying turn counts and verification language; 4 assignments (PS1, PS2, PS3, PRES1); 3 receipts at weeks 1, 3, 5 with rising dimension scores; `participant_fluency_profiles` + `participant_fluency_history` rows written through the real `updateFluencyProfile()` so the Fingerprint matures the same way production would.
- Cohort: 28 synthetic students with a realistic spread — a strong tail, a middle mass, and ~6 at-risk students with short single-tool no-verification threads so "assignments at risk" has genuine signal. Threads mapped to the same 4 assignments; submissions created per student.
- With ~29 real students in the class, drop the `100 / actualStudents` demo multiplier in `src/serverfn/admin-overview.ts` and the "Demo cohort · 100 students" chip: real counts are more credible than projected ones, and the earlier scaling plan existed only because the DB was empty. Flag: if you still want the 100-student headline, keep the multiplier and I'll seed 28 and scale.
- Running it: `bun run scripts/seed-demo-cohort.ts` (env vars as in the audit script), `--cleanup` to remove. No admin-triggered UI action — a seed button in the app is a foot-gun on a link you're sending to an outsider.

Auth note: synthetic students are created via the admin API with random passwords and never sign in; only the hero account has usable credentials.

## Ambiguities / judgment calls

- Whether the demo recipient logs in as the hero student, or gets a shared read-only account. Plan assumes one shared login with the hero student's data.
- Real vs. scaled cohort numbers in Department View (above).
- Tour step 3 shows the Extension page but can't demonstrate a live capture; it explains rather than performs.
