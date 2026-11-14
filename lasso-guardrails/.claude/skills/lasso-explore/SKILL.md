---
name: lasso-explore
description: Guardrails for exploratory or side work on Lasso / Charlotte (repo lasso-by-charlotte-labs) while other agents and Lovable are building on main. Use when asked to try a concept, prototype, spike, A/B two versions of something, "explore", "test an idea", "feature test", or any change the founder has not asked to ship. Not for the scoped design/phase PRs, which follow the PR template.
---

# Lasso exploration guardrails

Lasso has one `main` that Lovable syncs from and several agents land PRs on every
few hours. An experiment must never change what they see. Code isolation is easy
(a branch). The real collisions are the shared Supabase project, Lovable, and
`main`. These rules cover all three.

## 1. Where the work lives

- Branch name is always `x/<name>`. For two versions of one idea: `x/<name>-a` and `x/<name>-b`.
- Branch from the latest `origin/main`. Fetch first.
- Push only to your own `x/` branch. Never to `main`, never to another agent's branch (`design/*`, `ask-*`, `audit-*`, `claude/*`).
- Do not open a PR from an `x/` branch. Exploration is not a candidate for merge.
- Rebasing or force-pushing is fine on `x/` branches only (nobody else builds on them). Never on anything already merged or shared.

## 2. Shared state: read freely, write nothing shared

The app points at the one production Supabase project. Lovable's preview does too.

- No new migrations, no edits to `supabase/migrations/` or `drizzle/`, no SQL that writes.
- If the concept needs new data, keep it in local React state, a fixture, or `localStorage` behind the flag. If it truly needs tables, stop and ask; the architect owns the database, and a Supabase branch is the answer, not prod.
- Sign in with QA accounts only. Never create, edit or delete real workspaces, boards, or users.
- Do not rename `lasso_*` MCP tools, `--lasso-*` tokens, or PostHog events. Do not emit new PostHog events from an experiment (it pollutes the data the product decisions run on). If you need to measure, log to console.
- `bun.lock` stays unchanged. If a dependency is essential to the concept, say so in the summary instead of adding it.

## 3. Keep the experiment switchable

Follow the skin-switch pattern already in the app (`data-skin`, `?brand=charlotte`):

- Put the new behaviour behind a URL flag: `?x=<name>` (and `?x=<name>-b` for a second variant in the same build when that is easier than two branches).
- With no flag the app must render exactly as `main`. That is what makes the experiment safe to look at side by side and cheap to throw away.
- Prefer new files over editing shared ones. When you must edit a shared component, keep the diff to the flag check and the call into your new file.

## 4. Lovable

- Do not prompt Lovable on files an experiment touches while it might be promoted (one writer at a time, per the PR template).
- Lovable never sees `x/` branches, which is the point. Nothing reaches the editor or preview until it goes through a real PR.

## 5. Finishing

Report three things, every time:

1. What the concept does and how to see it: branch, flag, and the route(s).
2. Files touched, split into new vs edited shared files.
3. Verdict needed from the founder: keep exploring, promote, or bin.

**Promote** means a new properly named branch (for example `design/...`) cut from fresh `origin/main`, the useful commits cherry-picked or rewritten, the flag removed or kept on purpose, and a PR using `.github/pull_request_template.md`. The `x/` branch itself is never merged.

**Bin** means deleting the branch. Nothing else to clean up, because nothing shared was touched.

If you were started by `lasso-x try`: commit on `x/<name>`, do not push. The founder views it on localhost and runs `lasso-x keep` or `lasso-x scrap`.

## Quick check before any push

- [ ] Branch starts with `x/`
- [ ] No files under `supabase/`, `drizzle/`, or `bun.lock` changed (`git diff --stat origin/main`)
- [ ] App with no `?x=` flag looks identical to `main`
- [ ] No new PostHog events, no writes to shared data
