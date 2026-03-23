# Workflow Orchestration

## Overview

The workflow is structured around key principles such as planning, subagent utilization, self-improvement, verification, and a balanced approach to elegance. Each section provides actionable steps to guide agents through the process of managing tasks, implementing changes, and learning from their experiences.

We will primarily be utilizing the `prds/` directory to organize prds, plans, todos, and lessons learned. This structure allows for clear documentation and easy access to relevant information throughout the development process. Make sure to keep this directory updated with your work and insights as you progress through your tasks as this will be crucial for tracking your progress and learning from your experiences.

## 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

## 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents with cheaper/lightweight models
- For complex problems, throw more compute at it via subagents and ONLY use the same model as the parent
- One task per subagent for focused execution

## 3. Self-Improvement Loop

- After ANY correction from the user: update `prds/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

## 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

## 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes -- don't over-engineer
- Challenge your own work before presenting it

## 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests -- then resolve them
- Zero context switching required from the user
- Go fix failing Cl tests without being told how

## 7. Testing

- Use TDD for new features and bug fixes when applicable
- Ensure tests cover relevant scenarios and edge cases
- Write clear, descriptive test cases that explain the intent of the test
- Regularly run tests after changes to maintain code quality and reliability (ONLY use `pnpm test:changed` to run only affected tests)

# Task Management

1. PRD Creation: For any non-trivial task or new feature implementation, first create a PRD in `prds/<prd-name>/todos.md` outlining the plan with checkable items using the `prd-to-issue` skill.

2. Plan: Write plan to `prds/<prd-name>/todos.md` with checkable items using any of the following (in order of preference):
   - `prds/<prd-name>/prd.md`file
   - `gh issue view <issue-number>`
   - `prd-to-issue` skill.

   This plan should be detailed enough to guide implementation without ambiguity.

3. Verify Plan: Check in before starting implementation

4. Track Progress: Mark items complete as you go. Do not wait until the end to update progress. Make sure:
   - If you deviate from the original plan, update the the main PRD file and the todos with the new plan and add a note about why you deviated to for future reference.
   - If you get stuck or skip a task, update the todos with where you got stuck and what you tried so far. This will help others understand the context if they need to step in to help.
   - Mark the issue as done or complete within github as well when you finish the task to keep everything in sync and up to date.

5. Explain Changes: High-level summary at each step

6. Document Results: Add review section to the relevant `prds/<prd-name>/todos.md`

7. Capture Lessons: Update `prds/lessons.md` after corrections

# Core Principles

- Simplicity First: Make every change as simple as possible. Impact minimal code. Strive for elegant solutions, but balance with pragmatism. Don't over-engineer simple fixes.
- No Laziness: Find root causes. No temporary fixes. Senior developer standards.
- Minimal Impact: Only touch what's necessary. No side effects with new bugs.
- Self-Improvement: Learn from mistakes. Update lessons. Iterate until mastered.
- Verification: Prove correctness before marking done. Tests, diffs, logs, demos.
- Autonomy: Take ownership. Fix bugs without hand-holding. Be proactive in finding and resolving issues when they arise.
- Testing: Always write tests for new features and bug fixes, if applicable. Ensure that your tests cover the relevant scenarios and edge cases to maintain code quality and reliability.

## Learned User Preferences

- When implementing from an attached PRD plan, do not edit the plan file; track work in `prds/<prd-name>/todos.md` and existing todo items instead.
- When a plan specifies a commit order or split (e.g. migration vs tests), match that order in git commits.
- If the user says not to push yet, commit locally only and do not push or assume remote updates.
- When asked to run tests, prefer scoped commands (e.g. `pnpm test:changed` or a single spec file); do not run the full integration or full suite if the user asks to limit scope.
- Before changing code for review-bot or external findings, verify each item against the current tree so fixes stay accurate and minimal.

## Learned Workspace Facts

- PostgreSQL RLS controls which rows a role can see or change; it does not restrict which columns may be updated. Column-level writes use `GRANT` / `REVOKE` on columns (or table-level privileges), not RLS alone.
- Privilege changes that are not modeled in Drizzle schema belong in hand-written SQL migrations; keep the same `REVOKE`/`GRANT` logic in migration, the canonical TS allowlist under `src/lib/db/privileges/` when used, `tests/helpers/db` bootstrap, testcontainers `grantRlsPermissions`, and CI grant steps when they must stay in lockstep.
- Ephemeral Postgres for security/integration tests applies migrations via `pnpm db:migrate` so `pg_policy` and related objects match the migration chain; relying on `drizzle-kit push` alone can drift from migration-defined policy text.
- RLS security tests that assert permission failures should use helpers that account for Drizzle-wrapped Postgres errors (e.g. a shared `expectRlsViolation` that inspects message/cause), not only `rejects.toThrow(/permission denied/)`.
- `src/lib/db/privileges/` is for migration-aligned privilege metadata such as column allowlists; large procedural RLS bootstrap SQL stays under `tests/helpers/db/` (e.g. `rls-bootstrap.ts`), not under `privileges/`.
- Optional local duplication audits: `pnpm run dup-check` runs jscpd using `.jscpd.json`; generated reports live under `jscpd-report/` and should stay gitignored.
