# Security Boundary Update — Implementation Plan

> **Issue:** [#282](https://github.com/saldanaj97/atlaris/issues/282) — Remove dangerous `getDb()` defaults from `dbClient` parameters

## Current State (Researched 2026-04-01)

The original PRD is **partially stale**. Here's the actual status:

| PRD Item | Status | Notes |
|----------|--------|-------|
| ① Remove `= getDb()` defaults from `plan-operations.ts` | ✅ Already done | All 4 functions (`checkPlanLimit`, `atomicCheckAndInsertPlan`, `markPlanGenerationSuccess`, `markPlanGenerationFailure`) already require explicit `dbClient` |
| ② Replace local `type DbClient` with canonical import | ✅ Already done in `plan-operations.ts` | Uses `import type { DbClient } from '@/lib/db/types'` |
| ③ Add defensive runtime guard for `TIER_LIMITS[tier]` | ✅ Already done | `checkPlanLimit` L46-49 and `atomicCheckAndInsertPlan` L135-138 both throw on unknown tier |
| ④ Remove `= getDb()` default from `safeMarkPlanFailed` | ✅ Already done | Takes explicit `dbClient: AttemptsDbClient` |
| ⑤ Update test call sites to pass `db` explicitly | ✅ Already done | All 3 test files already pass `db` from `@/lib/db/service-role` |

### What IS still outstanding

During research I found a **secondary instance** of the same anti-pattern that was NOT in the original PRD:

**`src/features/plans/api/pdf-origin.ts` (line 27):**
```ts
type DbClient = ReturnType<typeof getDb>;
```

This file:
1. Defines a **local `DbClient` type** derived from `getDb` instead of importing the canonical `DbClient` from `@/lib/db/types`
2. While the functions DO require `dbClient` explicitly (no dangerous default), the local type definition creates a maintenance hazard — if `getDb` changes, this type drifts from the canonical source

Additionally, a broader audit of `= getDb()` parameter defaults across the codebase reveals these files still use the pattern (though they're **outside** the original issue scope):

| File | Functions with `= getDb()` default |
|------|-------------------------------------|
| `src/lib/db/usage.ts` | `recordUsage` (L57), another fn (L74) |
| `src/lib/db/queries/helpers/task-relations-helpers.ts` | (L32) |
| `src/features/billing/quota.ts` | 2 functions (L75, L139) |
| `src/features/billing/subscriptions.ts` | `syncSubscriptionToDb` (L70) |
| `src/features/billing/tier.ts` | `resolveUserTier` (L16) |
| `src/features/billing/usage-metrics.ts` | 7 functions |

These are intentional "convenience defaults" in non-RLS-sensitive modules (documented in `src/lib/db/AGENTS.md` L118). They're a separate concern from the plan-operations security boundary.

---

## Proposed Changes

Given the research, this issue is **98% done**. The remaining work is minimal:

### Step 1.0 — Confirm issue scope with ACs

Review [#282](https://github.com/saldanaj97/atlaris/issues/282) acceptance criteria to confirm nothing else is expected.

### Step 1.1 — Fix local `DbClient` type in `pdf-origin.ts`

#### [MODIFY] [pdf-origin.ts](file:///Users/juansaldana/Dev/Projects/atlaris/src/features/plans/api/pdf-origin.ts)

- Replace `type DbClient = ReturnType<typeof getDb>;` with `import type { DbClient } from '@/lib/db/types';`
- Remove the unused `import type { getDb } from '@/lib/db/runtime';` import

```diff
-import type { getDb } from '@/lib/db/runtime';
+import type { DbClient } from '@/lib/db/types';
...
-type DbClient = ReturnType<typeof getDb>;
```

### Step 1.2 — Validation

1. `pnpm run type-check` — ensure no type errors
2. `pnpm run lint` — ensure no lint errors
3. `pnpm test:changed` — run affected tests

### Step 1.3 — Issue verification & closure

Walk through each acceptance criterion from #282:
- ✅ No `= getDb()` defaults in plan-operations or stream helpers
- ✅ Canonical `DbClient` type used (not local re-definition)
- ✅ Defensive runtime guard on `TIER_LIMITS[tier]`
- ✅ All test call sites pass `db` explicitly

Then close #282.

---

## Open Questions

> [!IMPORTANT]
> **Broader `= getDb()` cleanup:** The 7+ other files with `= getDb()` defaults are *intentionally excluded* from #282 (and documented in `src/lib/db/AGENTS.md`). Should we track a separate post-launch issue for auditing which of those should also lose their defaults? Or is the current scope sufficient for launch?
