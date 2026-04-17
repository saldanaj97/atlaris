# Codebase cleanup — findings only (2026-04-16)

This directory holds a **read-only** audit aligned with the codebase-cleanup skill: eight parallel research tracks, **no code changes** and **no commits**.

## Contents

| File | Purpose |
|------|---------|
| [00-meta-and-tooling.md](./00-meta-and-tooling.md) | Scope, constraints, available vs missing tools |
| [99-cross-track-coordination.md](./99-cross-track-coordination.md) | Overlaps, conflicts, suggested merge order if you implement later |
| [01-dedup-dry.md](./01-dedup-dry.md) | Near-duplicates, DRY opportunities |
| [02-type-consolidation.md](./02-type-consolidation.md) | Duplicate types, naming collisions, layering |
| [03-dead-code.md](./03-dead-code.md) | Unused deps, Knip blocked, verification gaps |
| [04-circular-deps.md](./04-circular-deps.md) | Madge results (with `tsconfig`) |
| [05-weak-types.md](./05-weak-types.md) | `any`, `unknown`, `Record<string, unknown>`, double assertions |
| [06-defensive-code.md](./06-defensive-code.md) | try/catch, silent paths, boundaries |
| [07-deprecated-legacy.md](./07-deprecated-legacy.md) | Legacy wording, compat shims, confusing docs |
| [08-ai-slop-comments.md](./08-ai-slop-comments.md) | History-style comments, narration, TODOs |

Subagent transcripts are not stored here; this folder is the durable artifact.
