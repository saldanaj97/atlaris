# Workflow Orchestration

## Agent Context

**Agent Memory:** Recurring preferences and durable workspace facts live in `.agents/lessons.md`. Read that file whenever you read or apply this file.

**Agent Context:** Repo-writable planning and handoff artifacts are local-only and belong under the daily recap layout (see below). Do not create or update planning artifacts under legacy `prds/`, legacy `.plans/`, flat `.agents/plans/`, flat `.agents/handoffs/`, or Cursor-native `.cursor/plans/` paths.`.cursor/plans/` is treated as a read-only export/import surface.

Organize same-day plans and handoff prompts under `.agents/recaps/MM-DD-YYYY/`, where the date folder uses the **current local calendar day** in `MM-DD-YYYY` format (for example, `06-10-2026`).

| Artifact                            | Path                                  |
| ----------------------------------- | ------------------------------------- |
| Plans, PRDs, todos, trackers        | `.agents/recaps/MM-DD-YYYY/plans/`    |
| Handoff prompts and review handoffs | `.agents/recaps/MM-DD-YYYY/handoffs/` |

Before writing a plan or handoff file:

1. Resolve today's date folder: `.agents/recaps/MM-DD-YYYY/`.
2. If it does not exist, create it plus `plans/` and `handoffs/` subfolders for that day.
3. Write the artifact under the matching subfolder for its type.

Keep the day's `plans/` folder updated with task progress and verification notes when the work calls for it. Durable cross-session lessons still belong in `.agents/lessons.md`, not in daily recap folders.

## Behavioral guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Testing

- Use TDD for new features and bug fixes when applicable
- Ensure tests cover relevant scenarios and edge cases
- Write clear, descriptive test cases that explain the intent of the test
- Regularly run tests after changes to maintain code quality and reliability (prefer explicit scoped commands like `pnpm test:unit:changed`, `pnpm test:integration:changed`, or a targeted spec file)
- Before considering any implementation complete, always run `pnpm test` and `pnpm check:full` as the final validation baseline to catch regressions outside the immediately edited files.

# Core Principles

- Simplicity First: Make every change as simple as possible. Impact minimal code. Strive for elegant solutions, but balance with pragmatism. Don't over-engineer simple fixes.
- No Laziness: Find root causes. No temporary fixes. Senior developer standards.
- Minimal Impact: Only touch what's necessary. No side effects with new bugs.
- Self-Improvement: Learn from mistakes. Update lessons. Iterate until mastered.
- Verification: Prove correctness before marking done. Tests, diffs, logs, demos. Final validation must include `pnpm test` and `pnpm check:full`.
- Autonomy: Take ownership. Fix bugs without hand-holding. Be proactive in finding and resolving issues when they arise.
- Testing: Always write tests for new features and bug fixes, if applicable. Ensure that your tests cover the relevant scenarios and edge cases to maintain code quality and reliability.
