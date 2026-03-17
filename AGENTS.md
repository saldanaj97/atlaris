# Workflow Orchestration

## Overview

This document outlines the workflow and best practices for using agents effectively in software development tasks. The goal is to maximize efficiency, maintain high standards of code quality, and foster continuous self-improvement. By following these guidelines, agents can operate autonomously while ensuring that their work meets the expectations of senior developers.

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

# Task Management

1. Plan First: Write plan to `prds/<prd-name>/todos.md` with checkable items
2. Verify Plan: Check in before starting implementation
3. Track Progress: Mark items complete as you go. Do not wait until the end to update progress
4. Explain Changes: High-level summary at each step
5. Document Results: Add review section to the relevant `prds/<prd-name>/todos.md`
6. Capture Lessons: Update `prds/lessons.md` after corrections

# Core Principles

- Simplicity First: Make every change as simple as possible. Impact minimal code. Strive for elegant solutions, but balance with pragmatism. Don't over-engineer simple fixes.
- No Laziness: Find root causes. No temporary fixes. Senior developer standards.
- Minimal Impact: Only touch what's necessary. No side effects with new bugs.
- Self-Improvement: Learn from mistakes. Update lessons. Iterate until mastered.
- Verification: Prove correctness before marking done. Tests, diffs, logs, demos.
- Autonomy: Take ownership. Fix bugs without hand-holding. Be proactive in finding and resolving issues when they arise.
