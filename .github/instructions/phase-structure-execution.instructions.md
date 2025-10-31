---
description: Phase folder structure and task execution workflow for specs
applyTo: specs/**/*
---
# Phase Structure and Execution Workflow

Follow this workflow to structure phase folders in `specs/` and execute tasks predictably. Keep work atomic, traceable, and easy to resume.

## Phase folder naming

- Name folders using `###-feature-name/`.
  - Examples: `001-generate-learning-plans/`, `002-background-workers/`, `003-stripe-integration/`, `007-plan-structuring/`.

## Required files in every phase folder

1. `context.md` — concise context for the problem/feature at hand
2. `plan.md` — detailed plan of steps/tasks (source of truth, but not for day-to-day execution)
3. `tasks-overview.md` — checklist overview of tasks and steps with current progress

Recommended:

- `tasks/` directory with `task-#.md` files containing isolated instructions for each task

## Execution workflow

1) Always start with `tasks-overview.md` to determine the exact task and step to resume.

- Identify current position (e.g., "Task 2, Step 3" or "Task 3 completed").
- Do not derive next steps from `plan.md` without confirming via `tasks-overview.md`.

2) Implement only the required unit of work next.

- If paused at Task X, Step Y — complete only Task X, Step Y and stop.
- If Task N is fully done — move to Task N+1, complete all its steps, then stop.

3) Use `tasks/task-#.md` as the source of truth for implementation.

- Do not use full `plan.md` during implementation unless explicitly requested.
- Use only the relevant `task-#.md` (e.g., `task-3.md`) for steps and acceptance criteria.

4) Update `tasks-overview.md` immediately after finishing.

- Check off completed tasks/steps and add any notes needed to resume later.
- Do not begin the next task until the overview is updated.

## Examples

- Example 1: If `tasks-overview.md` indicates Task 2, Step 3 is next — complete only Task 2, Step 3 and stop. Update `tasks-overview.md`.
- Example 2: If Task 3 is fully complete — move to Task 4, complete all steps within Task 4, update `tasks-overview.md`, then stop (do not start Task 5).

## Do / Don't

Do:

- Use `tasks-overview.md` to choose the exact resume point.
- Implement only the specified task/step.
- Use `tasks/task-#.md` for implementation details.
- Update `tasks-overview.md` when done.

Don't:

- Skip ahead past the next defined task/step.
- Rely on `plan.md` for execution without explicit instruction.
- Leave `tasks-overview.md` stale after completing work.

## Quick session checklist

1. Open `specs/<phase>/tasks-overview.md` and locate current task/step.
2. Open `specs/<phase>/tasks/task-#.md` for the active task.
3. Implement only that task or the specified step(s).
4. Update `specs/<phase>/tasks-overview.md`.
5. Stop until explicitly instructed to proceed.
