# Rethink Navigation Hierarchy + Threads Typography

Right now the sidebar treats Workspace and Classes as two flat groups. Threads/Receipts live under Workspace, so once a student is inside ECON201 there is no visual signal that the Threads screen they're looking at is scoped to ECON201. Meanwhile the assignment cards in the Threads mapping column read at 13 px alongside 15 px thread rows on the right — the anchor of the whole page is quieter than the nodes it anchors.

## 1. Sidebar: class becomes the primary container

Restructure so a class is a folder containing its own Threads / Receipts / Assignments, matching how students actually think ("my ECON stuff"). The top-level Workspace group becomes lighter — just cross-class shortcuts.

New shape when a class is expanded:

```text
Workspace
  Home
  All Threads         (cross-class inbox)
  All Receipts

Classes
  ECON201                       ← class name / course code
    Threads                     (scoped: /participant/department/ECON201/threads)
    Receipts                    (scoped)
    Overview
    Assignments
      PS1  Scarcity...
      PS2  Elasticity...
      PS3  Market Power...
      PRES1 Applied Market...
  BIO110
    ...
```

Behavior:
- The active class auto-expands (already does). Its Threads/Receipts children highlight when the URL matches.
- "All Threads" and "All Receipts" stay at the top level so cross-class review is one click away — renamed from "Threads"/"Receipts" so the scope is unambiguous.
- Collapsed sidebar: class icon only, tooltip shows class name; no children.
- New scoped routes:
  - `/participant/department/$classId/threads` — same list component, prefiltered to threads mapped to that class's assignments (or captured while that class workspace was active).
  - `/participant/department/$classId/receipts` — receipts whose assignment belongs to the class.

## 2. Threads screen: assignment title as the visual anchor

Apply an Apple-style hierarchy where the item you're mapping *to* reads louder than the items being mapped.

Current: assignment code 13 px semibold, title 12 px muted, both cramped inside a 240 px card next to a Receipt button.

New:
- Assignment code (`PS1`, `PRES1`) — 11 px uppercase tracking-wide muted (a tag, not a title).
- Assignment **title** — 18 px semibold, tight leading, two-line clamp. This is the row's headline.
- Meta line (due date · N mapped) — 12 px muted below the title.
- Card padding bumps to `p-4`, min-height ~92 px so the row breathes and gives the connection lines a clear anchor point.
- "Generate Receipt" button stays left, but restyled as a compact vertical pill (icon over label) so it doesn't compete with the title.
- Left column widens from 360 px to ~420 px on `lg+` to fit the larger title without truncation on realistic assignment names.
- Section header above the list changes from `ASSIGNMENTS / ECON201` (both tiny) to a single 13 px uppercase `ECON201 · ASSIGNMENTS` label — the class context is now provided by the sidebar, so we don't need to repeat it as a heading.

## 3. Small consistency wins

- Threads page header ("Threads") gets a subtitle showing the current class scope when the route is class-scoped ("ECON201 · Captured AI conversations…").
- Same treatment reused on the scoped Receipts route.

## Technical notes

**Files touched (UI only, no schema):**
- `src/components/participant/ParticipantSidebar.tsx` — restructure groups, add class-scoped Threads/Receipts children, rename top-level entries to "All Threads" / "All Receipts".
- `src/routes/participant.threads.index.tsx` — new typography scale in assignment cards, widen left column, restyle Receipt button, update section label.
- `src/routes/participant.department.$classId.threads.tsx` **(new)** — thin wrapper reusing the existing threads list with a `classId` filter prop.
- `src/routes/participant.department.$classId.receipts.tsx` **(new)** — same pattern for receipts.
- `src/serverfn/threads.ts` / `src/serverfn/receipts.ts` — add optional `classId` filter param (server-side join on `assignment_submissions` → `assignments.class_id`). No new tables.

**Out of scope:** mobile sidebar rework, changing the mapping/connection-line renderer, receipt template logic. Ask if you'd like those in a follow-up.
