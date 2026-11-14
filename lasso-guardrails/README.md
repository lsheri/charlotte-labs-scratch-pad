# Lasso exploration kit

Try concepts on the latest Lasso code without touching the live build, other agents, or Lovable.

Three pieces, meant to be copied into `lasso-by-charlotte-labs`:

| File | Goes to | What it does |
|---|---|---|
| `.claude/skills/lasso-explore/SKILL.md` | same path in the repo | Rules any Claude session loads when you say "explore", "try", "A/B", "spike" |
| `scripts/lasso-x` | `scripts/lasso-x` (and on your PATH) | Laptop helper: one folder per experiment, own port, main kept synced |
| `AGENTS.md` snippet (below) | append to `AGENTS.md` | Two-line pointer so every agent finds the skill |

## The model in one picture

```
~/code/lasso                 main. Clean mirror of GitHub. Never edit here.
~/code/lasso-x-tooltips      branch x/tooltips      port 5235
~/code/lasso-x-ask-bar-a     branch x/ask-bar-a     port 5237   ┐ two versions
~/code/lasso-x-ask-bar-b     branch x/ask-bar-b     port 5230   ┘ side by side
```

Each folder is a git worktree: same repo, separate checkout, separate `node_modules`, separate dev server. Nothing you do in one is visible in another or on GitHub until you push its `x/` branch.

## Laptop setup (once)

```sh
mkdir -p ~/code && cd ~/code
git clone https://github.com/lsheri/lasso-by-charlotte-labs.git lasso
cp /path/to/lasso-x ~/code/lasso/scripts/lasso-x   # or after it lands in the repo, skip this
sudo ln -s ~/code/lasso/scripts/lasso-x /usr/local/bin/lasso-x   # or any folder on your PATH
```

Keep `main` current automatically (every 30 min, macOS):

```sh
( crontab -l 2>/dev/null; echo '*/30 * * * * /usr/local/bin/lasso-x sync >/dev/null 2>&1' ) | crontab -
```

`sync` refuses to run if you edited the main folder, so it can never clobber work. It only fast-forwards.

## The loop: hand off, look, decide

```sh
lasso-x try hero "Make the landing hero calmer, one focal point"   # Claude works in the background
lasso-x pair ask-bar "Compact Ask bar on phone"                    # two Claudes, variant a and b, in parallel
lasso-x list            # who's still working
lasso-x log hero        # what Claude did and which route to open
lasso-x run hero        # localhost:<port>/<route>?x=hero
lasso-x keep hero       # guard check, push design/hero, prints PR link
lasso-x scrap ask-bar-b # gone, folder and branch
```

`keep` refuses if the change touches `supabase/`, `drizzle/` or a lockfile, or if Claude is still running. It pushes `design/<name>`, never `main`. Merging is the normal PR, so Lovable only ever sees reviewed work.

`try` needs the Claude Code CLI (`claude`) on your laptop. It runs with edits auto-accepted, inside that one folder only.

## Manual use

| You want | Run |
|---|---|
| Latest code in the main folder | `lasso-x sync` |
| Try one idea | `lasso-x new tooltips` then `lasso-x run tooltips` |
| Two versions of the same idea | `lasso-x pair ask-bar` then `run ask-bar-a` / `run ask-bar-b` in two terminals |
| See what's open, how stale | `lasso-x list` |
| Pull new main into an experiment | `lasso-x refresh tooltips` |
| Throw it away | `lasso-x scrap tooltips` |

Open the experiment folder in Claude Code (or Cursor) and work there. The skill tells the agent the rules.

## Cloud sessions (claude.ai/code)

Each cloud session is already its own isolated copy. Start the session on `lasso-by-charlotte-labs` and say:

> Explore: <idea>. Use the lasso-explore skill. Branch `x/<name>`.

Two versions = two sessions, `x/<name>-a` and `x/<name>-b`. Same rules.

## The guardrails, short version

1. **Branch `x/<name>`.** Never push to `main` or anyone else's branch. No PRs from `x/`.
2. **Shared data is read-only.** One Supabase project serves prod and Lovable preview. No migrations, no writes, QA accounts only, no new PostHog events.
3. **Behind a flag.** `?x=<name>`. No flag = identical to main.
4. **No `bun.lock` changes.** Name the dependency instead.
5. **Promote, never merge.** A keeper gets a fresh `design/...` branch from new main and a normal PR with the template. The `x/` branch is then deleted.

Why the data rule matters most: two code branches can't hurt each other. One experiment that writes to the shared database or fires PostHog events can corrupt what every other agent, the preview, and your product analytics see. That is the only collision a branch does not prevent.

## AGENTS.md snippet

```md
- Exploratory or side work (try, spike, A/B, explore) follows `.claude/skills/lasso-explore/SKILL.md`: branch `x/<name>`, flag `?x=<name>`, no shared-data writes, no PR from `x/`.
```
