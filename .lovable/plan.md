## 1. Add Problem Set 3

Insert PS3 ("Market Power, Strategic Behavior & Market Failure") into `class_assignments` for ECON201, matching the same rubric shape as PS1/PS2 (parts A/B/C, per-question points, weights 40/30/20/10). Due start of Week 13.

## 2. Sidebar: workspace → assignments dropdown

Today the sidebar has flat entries: `Workspaces`, `Threads`, `Receipts`, and (if the user is in a class) a `Department` link.

Change: replace the single `Department` link with a **per-class collapsible group** below the Workspace section. Each open/active class shows:

```text
▾ ECON 201 · Principles of Microeconomics
    Overview          (→ /participant/department/$classId)
    ── Assignments ──
    PS1  Problem Set 1                (→ .../assignments/$id)
    PRES1 Presentation                (→ .../assignments/$id)
    PS2  Problem Set 2
    PS3  Problem Set 3
```

Uses shadcn `Collapsible` inside `SidebarGroup`. Default open when the current route is inside that class. Assignments are fetched once via a new lightweight `listClassSidebar()` server fn (id, name, assignments: `[{id, code, title}]`), cached per class in component state.

New route stub: `/participant/department/$classId/assignments/$assignmentId` renders a simple assignment detail page (title, description, rubric parts, due date, list of the student's own submissions/mapped threads). Full detail page can grow later.

## 3. Threads page: map threads to assignments

Rework `/participant/threads` into a two-column layout when the student belongs to at least one class. If they belong to none, the current single list is preserved.

```text
┌───────────────────────┬──────────────┬────────────────────────────┐
│  Assignments (left)   │   center     │  Threads (right)           │
│                       │              │                            │
│  ECON201 ▾            │              │  [thread card]  Map ▸      │
│   • PS1   (2 mapped)  │  ┌────────┐  │  [thread card]  Map ▸      │
│     └ Generate Receipt│  │        │  │  [thread card]  Map ▸      │
│   • PRES1 (0)         │  └────────┘  │  ...                       │
│   • PS2   (1 mapped)  │              │                            │
│   • PS3   (0)         │              │                            │
│  Unassigned  (5)      │              │                            │
└───────────────────────┴──────────────┴────────────────────────────┘
```

Interaction:
- Left: a list of the student's classes → assignments. Selecting an assignment "focuses" it (highlights the row and filters the right side to show the mapped threads first, then the rest as "Available to map").
- Right: each thread card gets an `Assign ▸` menu listing the student's assignments. Choosing one maps it. A mapped thread shows a small chip like `PS1 ×` (click × to unmap).
- Center strip: when an assignment is focused AND has ≥1 mapped thread, a prominent `Generate Receipt` button appears there. It opens the existing `NewReceiptDialog` prefilled with the mapped threads, defaults the workflow name to the assignment code+title, and after the receipt is created writes the resulting `receipt_id` into `assignment_submissions` (one row per assignment/participant, upsert).

The existing "Select threads → Generate Receipt (N)" flow remains, so students can still generate a receipt that isn't tied to an assignment.

## 4. Schema

Add a mapping table so a thread can be tied to an assignment before any receipt exists (current `assignment_submissions` only holds `receipt_id`).

```sql
create table public.assignment_threads (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.class_assignments(id) on delete cascade,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  participant_id uuid not null references auth.users(id) on delete cascade,
  mapped_at timestamptz not null default now(),
  unique (assignment_id, thread_id)
);
```

- `GRANT` to authenticated + service_role
- RLS: participant can `select/insert/delete` where `participant_id = auth.uid()` AND is a member of the assignment's class session; instructor of the class can `select`
- No update policy (map or unmap only)

`assignment_submissions` is still written when a receipt is generated for an assignment (existing shape), so the Department view keeps working.

## 5. Server functions

New file `src/serverfn/assignments.ts` (auth-scoped, uses `requireSupabaseAuth`):
- `listClassSidebar()` → for each of the student's classes: `{ id, name, courseCode, assignments: [{id, code, title, dueAt}] }`
- `mapThreadToAssignment({ threadId, assignmentId })`
- `unmapThreadFromAssignment({ threadId, assignmentId })`
- `listAssignmentMappings({ classId? })` → for the current student: array of `{ assignmentId, threadIds: [] }`
- `getAssignmentDetail({ assignmentId })` → assignment + this student's mapped threads + latest submission receipt

Reuses existing `createReceiptFromThreads` from `serverfn/threads`; the threads page adds a post-success `upsert` into `assignment_submissions` when the receipt was generated in the "assignment-focused" flow.

## 6. Files touched

- `supabase/migrations/*` — PS3 insert + `assignment_threads` table with GRANT/RLS
- `src/components/participant/ParticipantSidebar.tsx` — replace flat Department link with per-class collapsible group
- `src/serverfn/assignments.ts` — new
- `src/serverfn/department.ts` — extend `listMyClasses` (or new sidebar fn) to include assignments
- `src/routes/participant.threads.index.tsx` — two-column layout, assignment focus, per-thread `Assign ▸` menu, center Generate-Receipt button, hooks into new server fns
- `src/routes/participant.department.$classId.assignments.$assignmentId.tsx` — new assignment detail route (basic)
- `src/routeTree.gen.ts` — auto-regenerated

## 7. Out of scope this pass

- Drag-and-drop with animated sankey lines (the screenshot is inspiration; we ship a clean click-to-map interaction first — dragging can be layered on later).
- Instructor-side assignment authoring UI (assignments will keep being seeded via SQL for the demo).
- Grading / scoring on submissions.
