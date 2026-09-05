---
name: react-doctor
description: Apply Atlaris verification policy when React Doctor is requested or useful for a material React concern.
---

# Atlaris react-doctor overlay

Read the target checkout's `AGENTS.md`, `ENGINEERING_RULES.md`, and `.cursor/rules/selective-verification.mdc`. This file adds repository policy; it does not define a second workflow.

Load the user-scoped `react-doctor` skill from the available skill catalog (on this installation, `~/.agents/skills/react-doctor/SKILL.md`; otherwise check `~/.codex/skills/react-doctor/SKILL.md`). Select that distinct user-scoped file, not this overlay, and execute its workflow once. Resolve its references relative to its own directory. If the shared skill is unavailable in another checkout, use the installed React Doctor CLI help and the repository policy for an explicitly requested or justified scan. Do not invent flags or make an optional personal skill a prerequisite for using the installed tool.

Repository verification timing and scope come only from `.cursor/rules/selective-verification.mdc`. Preserve the user's authorized scope, unrelated work, and separate local and hosted evidence.
