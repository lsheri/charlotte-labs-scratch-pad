## Goal
Make `/admin` demo-ready for a university department buyer. Cut noise, foreground **AI Fluency**, and scale numbers so it reads like a 100-student cohort.

## Changes to `/admin`

**KPI row (5 → 5, replace one):**
- Keep: Students, Assignments, AI threads (+ turns), AI-triviality risk
- Remove: "Workflows logged"
- Add: **Overall Fluency Score** (0–100, color-banded)

**New card — Fluency by dimension (AI Fluency 4Ds + Ethics):**
Horizontal bars, 0–100, per dimension with a one-line interpretation:
- Direction — clarity of student goals given to AI
- Delegation — right work sent to AI vs. kept human
- Discernment — verifying / challenging AI output
- Development — building on AI output rather than accepting it
- Ethics — attribution, honesty, appropriate use

Values pulled from `participant_fluency_profiles` averaged across the department; if empty (current DB has no rows), fall back to demo values so the card is never blank in a pitch.

**Assignments at risk:** keep as-is (already the strongest section).

**Tools in use / Verification pattern:** keep — both directly answer "what are students actually doing with AI."

**Recent AI collaboration workflows list:** remove. It's per-student noise; a department buyer wants aggregates, not a feed.

## Scaling to a 100-student cohort
Apply a demo multiplier (`100 / actualStudents`, rounded) inside the server function to:
- Students → 100
- AI threads and total turns
- Per-assignment `threadCount` and `uniqueStudents` (capped at 100)

Do NOT scale:
- Assignments (real count from the class)
- Fluency dimension scores, risk scores, verification % — these are ratios, not counts
- Tool breakdown percentages (scale counts proportionally so bar shape is preserved)

A small `Demo cohort · 100 students` chip under the header makes the projection explicit rather than misleading.

## Files
- `src/serverfn/admin-overview.ts` — remove `recentReceipts` from return; add `fluency` (per-dimension averages + overall); apply demo scaling to student/thread counts.
- `src/routes/admin.tsx` — swap "Workflows logged" KPI for "Fluency score"; add Fluency-by-dimension card; drop the recent workflows list; add the "Demo cohort" chip.

## Out of scope
Drill-downs, per-student pages, exports, filters, date ranges. Not needed for a first demo and would dilute the pitch.
