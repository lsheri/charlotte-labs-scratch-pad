## Goal

Treat a "class" as a regular workspace (a `research_sessions` row), seed **Principles of Microeconomics — ECON201**, add an **Assignments** concept, and give every member a **Department** view showing class-wide tools, fluency, and assignments at risk of AI trivialness. Instructor and student see the same view (matches your answer).

## 1. Seed workspace + membership

Insert one row into `research_sessions`:
- `name`: "Principles of Microeconomics — ECON201"
- `description`: "ECON201 class workspace"
- `kind`: `research` (we're reusing the existing kind — no enum change)
- `status`: `active`
- `join_code`: `ECON201`
- `researcher_id`: liam@charlotte-labs.com's user id
- `consent_text`: class-appropriate copy

Insert `session_participants` row auto-consenting liam as both owner + member so he sees it in his workspace list.

Tag class workspaces via a new `metadata` jsonb column on `research_sessions` (added in step 2) with `{ "kind": "class", "course_code": "ECON201", "term": "Spring 2026" }` — avoids touching the `kind` enum while keeping room for future class fields (roster caps, term dates).

## 2. Assignments schema

New tables (migration, with GRANTs + RLS):

- `class_assignments`
  - `session_id` fk → research_sessions
  - `code` (e.g. `PS-01`), `title`, `description`, `due_at`
  - `expected_tools text[]` (e.g. `['chatgpt','claude']`) — optional
  - `rubric jsonb` (free-form for now)
- `assignment_submissions`
  - `assignment_id` fk
  - `participant_id` fk → auth.users
  - `receipt_id` fk → receipts (nullable — students attach a receipt)
  - `submitted_at`, `notes`
  - unique(`assignment_id`,`participant_id`)
- Add `metadata jsonb default '{}'::jsonb` to `research_sessions` for the class tag above.

**RLS:**
- Members of the session can `SELECT` assignments/submissions in their session.
- Members can `INSERT/UPDATE` their own submission rows.
- Session owner (researcher_id) can `INSERT/UPDATE/DELETE` assignments.

**AI trivialness risk** is derived, not stored — computed from the submission's linked receipt:
- Low tool count + short prompts + high "single-shot copy" pattern → **high risk**
- Multi-turn + revisions + multiple tools + explicit critique turns → **low risk**
- Formula lives in `src/lib/trivialnessRisk.ts` so it's easy to tune later.

## 3. Server functions

New file `src/serverfn/department.ts`:
- `listMyClasses()` — workspaces where `metadata->>'kind' = 'class'` that the user belongs to.
- `getDepartmentOverview({ classId })` — returns:
  - class meta (code, title, join code)
  - member count
  - **tool usage**: aggregate `receipts.tool_used` counts across all members in that session
  - **class fluency**: average of members' latest `participant_fluency_profiles` scores per dimension (already scoped by session in existing tables)
  - **assignments** with per-assignment stats: submitted count, avg risk, list of at-risk submissions (top N)
- `listClassAssignments({ classId })`, `getAssignmentDetail({ assignmentId })` — for later mock-data drill-downs.

All use `requireSupabaseAuth` and check membership via `session_participants`.

## 4. Department view (route + UI)

New routes:
- `src/routes/participant.department.tsx` — index. If user belongs to exactly one class, redirect to its detail; otherwise list class workspaces.
- `src/routes/participant.department.$classId.tsx` — the actual dashboard.

Dashboard sections (same for everyone):
1. **Header** — course code + title, member count, join code chip.
2. **Class tools** — reuse `ToolLogo` in a horizontal bar with usage counts (bar chart via existing `chart.tsx`).
3. **Class fluency** — reuse `FluencyRadarChart` (already exists) fed by the aggregated dimension scores.
4. **Assignments** — table: code, title, due date, submitted / total, "at risk" count badge. Rows expand to show at-risk submissions (participant anon label + receipt link).
5. Empty states everywhere so it renders cleanly before you upload mock data.

## 5. Sidebar entry

Edit `src/components/participant/ParticipantSidebar.tsx`:
- Add a "Department" item (icon: `GraduationCap` from lucide) linking to `/participant/department`.
- Show it only when `listMyClasses()` returns ≥ 1 (small `useQuery` in the sidebar), so it stays hidden for users without a class.

## 6. Out of scope this pass

- Creating mock student accounts and mock receipts — you'll do that next; the schema + views will accept them as-is.
- Instructor-only controls (create assignment UI, roster management). Assignments will be seeded via the insert tool when you're ready with mock data, or we add an "Add assignment" dialog in a follow-up.
- Per-student drill-down beyond the anonymized at-risk list (you said same view for both).

## Technical notes

- No enum changes: `kind` stays `research`; class-ness lives in `research_sessions.metadata`.
- Trivialness risk is a pure function over a receipt row — cached per-receipt in memory during the overview query, no new column.
- Existing `anonymousLabel(userId)` from `src/lib/displayNames.ts` will label at-risk students in the class view too (consistent with admin views).
- All new tables get `GRANT SELECT/INSERT/UPDATE/DELETE ... TO authenticated` + `GRANT ALL ... TO service_role` in the same migration.
