# Workflow Orchestration

## Overview

**Agent memory:** Recurring preferences and durable workspace facts live in [`docs/agent-context/learnings.md`](docs/agent-context/learnings.md). Read that file whenever you read or apply this file.

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

- After ANY correction from the user: update `docs/agent-context/learnings.md` with the pattern
- Merge durable, reusable preferences and workspace facts into `docs/agent-context/learnings.md` when using the continual-learning skill or when the user asks
- Write rules and learnings for yourself that prevent the same mistake
- Ruthlessly iterate on these learnings until mistake rate drops
- Review learnings at session start for relevant project

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

2. Task Creation: Create a `prds/<prd-name>/todos.md` file with checkable items using any of the following (in order of preference):
   - `prds/<prd-name>/prd.md`file
   - `gh issue view <issue-number>`
   - `prd-to-issue` skill.

   This task list should be detailed enough to guide the planning process without ambiguity, but not so detailed that it is overwhelming.

3. Plan Creation: Create a plan file `prds/<prd-name>/plan.md` outlining the plan using the high level tasks from the `prds/<prd-name>/todos.md` file. This is where we want plenty of detail to reduce ambiguity and room for error by properly guiding the implementation.
Make sure to use the general format for each step/phase/slice in a plan: 
   1. Step X.0 — Fetch issue, confirm/add ACs
   2. Steps X.1–X.N — Implementation
   3. Validation Steps — Type check, lint, tests
   4. Issue Verification & Closure — Walk through each AC with concrete verification commands, then close the issues and/or any subtasks.

4. Verify Plan: Check in the plan before starting implementation to get feedback from the user and/or other agents.

5. Track Progress: Mark items complete as you go. Do not wait until the end to update progress. Make sure:
   - If you deviate from the original plan, update the the main PRD file and the todos with the new plan and add a note about why you deviated to for future reference.
   - If you get stuck or skip a task, update the todos with where you got stuck and what you tried so far. This will help others understand the context if they need to step in to help.
   - Mark the issue as done or complete within github as well when you finish the task to keep everything in sync and up to date.

6. Explain Changes: High-level summary at each step

7. Document Results: Add review section to the relevant `prds/<prd-name>/todos.md`

8. Capture Learnings: Update `docs/agent-context/learnings.md` if corrections or learnings are discovered.

# Core Principles

- Simplicity First: Make every change as simple as possible. Impact minimal code. Strive for elegant solutions, but balance with pragmatism. Don't over-engineer simple fixes.
- No Laziness: Find root causes. No temporary fixes. Senior developer standards.
- Minimal Impact: Only touch what's necessary. No side effects with new bugs.
- Self-Improvement: Learn from mistakes. Update lessons. Iterate until mastered.
- Verification: Prove correctness before marking done. Tests, diffs, logs, demos.
- Autonomy: Take ownership. Fix bugs without hand-holding. Be proactive in finding and resolving issues when they arise.
- Testing: Always write tests for new features and bug fixes, if applicable. Ensure that your tests cover the relevant scenarios and edge cases to maintain code quality and reliability.
