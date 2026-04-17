# Cross-track coordination

Use this when turning findings into PRs so tracks do not fight each other.

## Overlapping files / themes

| Area | Tracks |
|------|--------|
| `isAbortError`, `getErrorMessage`, client `fetch` + Zod | **dedup-dry**, **weak-types** (error narrowing), **defensive-code** (catch boundaries) |
| `src/features/plans/session/model-resolution.ts` vs `src/app/api/v1/plans/stream/model-resolution.ts` | **type-consolidation** (duplicate module + semantic drift), **dedup-dry** |
| Plan summary row types (`lib/db/queries/plans.ts` vs `features/plans/read-models/summary.ts`) | **type-consolidation** |
| `getStatusCode` vs `getStatusCodeFromError` (AI providers) | **dedup-dry**, **weak-types** |
| Error normalization (`error-normalization`, `error-response`, streaming) | **type-consolidation**, **weak-types**, **deprecated-legacy** (“legacy nested” shape), **defensive-code** |
| `router.ts` Google/OpenRouter comments | **deprecated-legacy**, **ai-slop-comments** |
| Analytics silent `catch` | **defensive-code** only |

## Conflicts / ordering

1. **Unify stream model resolution** (single module + tests) before any broad “extract shared fetch helper” refactors that touch the same routes.
2. **Centralize `isAbortError` / `getErrorMessage`** early — low risk, reduces churn in billing/profile components.
3. **Dead-code removals** (`jsonwebtoken`, `wrangler`, etc.) should wait on **`pnpm why`** / lockfile review per dead-code track — do not batch with type refactors blindly.
4. **Madge** reported no cycles; layering work (types to leaf modules) remains compatible with current graph.

## Subagent environment caveats

- **Knip** did not run to completion in the sandbox; dependency-level dead-code signals from ripgrep are stronger than export-level unused-file claims in this report.
