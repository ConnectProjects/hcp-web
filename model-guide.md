# Claude Code Model & Session Guide — HCP-Web

Reference doc for deciding which model to use, how to keep sessions lean, and how to get the most value per token. This is advisory — Claude Code won't auto-switch models based on this file, but it can read it and suggest a switch when relevant. Model switching is done manually via `/model`.

---

## 1. Sonnet — day-to-day work

Use for tasks that are well-scoped and don't require holding multiple interacting systems in mind at once.

- Small edits, refactors
- Writing tests
- Explaining existing code
- Straightforward, contained bug fixes

**Example prompts:**
- "Fix the stale overdue visits bug in the TechTool dashboard."
- "Write tests for the packet import function."

---

## 2. Opus — heavy lifting

Use for multi-file architecture decisions, root-cause analysis across stacked failures, and anything requiring the model to reason about several interacting pieces at once. Don't penny-pinch here — this is exactly the high-value work worth spending on.

- Multi-file architecture decisions
- Root cause analysis on stacked/compound failures
- Designing concurrency or coordination logic (e.g., atomic transactions, single-writer coordination)

**Example prompts:**
- "Investigate the three stacked failures in the Kal Tire Yorkton import — partial test import, mis-filed worker record, and wrong location stamping — then design an atomic transaction approach."
- "Design OPFS single-writer coordination for MasterDB to prevent race conditions during sync."

---

## 3. Fable 5 — maximum capability, maximum cost

Use only when Opus 4.8 isn't enough. Fable 5 is Anthropic's most capable model but costs **2× Opus** ($10/$50 per MTok vs $5/$25). It's not a cheaper alternative — it's a step up for the hardest reasoning and long-horizon agentic work.

Reserve for:
- Long-horizon autonomous runs that Opus struggles to complete correctly in one shot
- The hardest reasoning problems where Opus falls short
- Tasks where Fable 5's extended thinking depth changes the outcome

**Note:** Fable 5 has different API behavior — thinking is always on, no `budget_tokens`. For HCP-Web development this distinction only matters if you're building tooling that calls the API directly.

---

## 4. Session hygiene

- Run `/status` to check context usage when you suspect the window is getting large.
- Use `/compact` to trim a conversation you want to keep going but that's carrying dead weight.
- Start a **fresh session** once you're just scrolling back to remind Claude of something already resolved — don't wait for auto-compact to force it.

**Fresh vs compact:**
Mid-task, problem unsolved → `/compact`. Problem solved, new feature starting → fresh session. Rule of thumb: if you'd have to re-explain what you're doing, start fresh.

---

## 5. Getting the most from a session (not just minimizing tokens)

- **Front-load context** for hard problems — paste relevant files and the full failure description in one shot rather than dribbling info in over several messages.
- **Ask for a plan before code** on anything nontrivial — cheaper to redirect a plan than to redirect finished code.
- **Let Claude keep a scratchpad** on long tasks — a running list of what's been tried and ruled out, to avoid re-exploring dead ends later in the same session.
- **Batch related fixes** into one focused session when they touch the same code area, rather than one bug per session, since the relevant context is already loaded.

---

*Keep this file itself lean — reference it from CLAUDE.md rather than duplicating it there.*
