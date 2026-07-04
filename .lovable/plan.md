# Fork Charlotte into a Student Study App

## Recommendation on how to fork

**Remix this project in Lovable + fresh Cloud backend.** Rationale:

- Remix gives you a full 1:1 copy of the codebase, settings, and secrets scaffolding in seconds, and leaves this Charlotte research project untouched.
- You keep the live preview, Cloud, AI Gateway, and one-click publish — cloning to Claude/local loses all of that and forces you to run your own hosting.
- Fresh backend keeps the research project's participant data isolated from the student product (different users, different RLS scope, safe to break schema).
- After remix, we strip the workflows/receipts-generation surface down to the three templates you want. You can still edit the fork locally later by connecting GitHub — Remix doesn't lock you in.

**How to remix:** in the sidebar, right-click this project → Remix. Then open the new project and paste this plan into the first message.

---

## Scope of the fork (what the new app IS)

A student-facing app where every captured AI thread produces one **Receipt** that renders exactly three views in tabs:

1. **Academic Fluency** (adapted from Classic Fluency template)
2. **Verification & Informational Risk** (new — checklist of unverified claims / risky AI outputs)
3. **Study Gaps** (existing StudyGapTemplate, wired to real analysis instead of mock)

User picks which of the three to run per receipt (checkboxes on the create dialog). At least one required.

## What to KEEP from Charlotte
- Auth, profiles, user_roles
- Fingerprint (`/participant/fingerprint`)
- Threads (`/participant/threads`, thread capture, extension, thread_jobs)
- Workspaces (`/participant/workspaces`)
- Receipts infrastructure (receipts table, receipt_jobs, template_analyses, receipt-jobs worker)
- Chrome extension + capture pipeline
- Home shell + participant sidebar

## What to REMOVE / hide
- Workflow gating, workflow_templates, `/participant/workflows`, WorkflowStack, workflow tags/purpose UI
- All receipt templates except the three above: delete ContextMap, ThinkingMap, ImpactProof, ImpactStatement, ProofCard, Shield, StillYours from the picker and switch-case
- Researcher role surfaces (`/researcher/*`) — keep tables but hide routes; you can re-enable later
- Demo carousel on `/participant/demo` (or repurpose as onboarding)
- Provenance vial (lab vs personal) — student context makes this irrelevant

## New Home page (`/participant`)
Four stacked cards, in this order:

1. **Open Verification & Risk items** — aggregated across recent receipts, unchecked items only, click to resolve
2. **Study Gaps summary** — top high/medium-high gaps across last N receipts, "Start self-check" CTA
3. **Academic Fluency snapshot** — current overall score + 30-day sparkline
4. **Recent threads** — last 5 captured threads with status chip (analyzed / pending)

## New template: Verification & Informational Risk
Charlotte scans the thread and returns:
- **Unverified claims** — factual statements the student took from AI without checking (title, quote, suggested source to verify)
- **Informational risk items** — hallucination-prone patterns (fake citations, invented stats, unsupported causal claims), each with severity
- **Checklist state** — each item is `open | verified | dismissed`, persisted per receipt so Home can aggregate open ones

## Template selection UX
`NewReceiptDialog` becomes three checkboxes ("What should Charlotte generate?") — Academic Fluency, Verification & Risk, Study Gaps. Backend runs only the selected analyzers. `TemplateTabs` shows only tabs for templates that were run.

---

## Build order

1. **Remix + fresh Cloud** — user action, then confirm new project is live.
2. **Prune** — delete workflow routes/components, remove non-kept templates from picker + switch-case + `TEMPLATE_METADATA`, drop demo carousel.
3. **Verification & Risk template** — new `VerificationRiskTemplate.tsx`, new analyzer in `template-analyses.server.ts`, new types, checklist state table.
4. **Wire Study Gaps to real analysis** — replace mock in StudyGapTemplate with schema + analyzer (parallel to Verification analyzer).
5. **Adapt Academic Fluency** — rename Classic Fluency → Academic Fluency, retune prompt for academic context (syllabus/assignment aware).
6. **Rewrite NewReceiptDialog** — three checkboxes, drop workflow-type/tags/purpose/provenance fields.
7. **Rewrite Home** — four cards above, fed by new server fns aggregating across the user's receipts.
8. **Copy pass** — rename all "workflow" language to "receipt" / "study session", drop researcher wording.

## Technical notes

- **New tables** (fresh Cloud): `receipt_checklist_items(receipt_id, template_key, item_key, status, resolved_at, note)` for Verification & Risk state. RLS scoped to `auth.uid()` via receipt ownership. Include GRANTs per project rules.
- **`receipts.metadata` shape**: keep `workflowType` NOT NULL trigger for now by defaulting to `'study'`, OR drop the trigger in a migration. Cleaner to drop the trigger + `provenance` requirement since those concepts are gone.
- **Analyzer chunking**: reuse the same `mergeThinkingMapChunks`-style pattern for the two new analyzers; each returns a `nodes[]` or `items[]` array that stitches deterministically. Cap `max_completion_tokens` at 16000 (learned from the context_map bug).
- **Extension**: no changes — capture pipeline is thread-level and template-agnostic.
- **Removed routes**: delete files under `src/routes/researcher.*`, `src/routes/participant.workflows.tsx`, `src/routes/participant.demo.tsx`, and researcher-only admin views. Delete `WorkflowStack`, `workflow_templates` seed, workflow-tag helpers in `displayNames.ts`.

## Not in this plan (ask if you want them)
- Migrating any existing data from this project to the fork (fresh backend = empty)
- Custom domain for the new app
- Parent/teacher-facing views
- Grade integration (Canvas, Blackboard)

