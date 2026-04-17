# Track 1: dedup-dry

## 1) Research notes (with citations)

**Client billing: near-copy `fetch` → JSON → `safeParse` pipeline**

`SubscribeButton` and `ManageSubscriptionButton` share the same shape: POST with JSON, distinguish network vs response, `parseApiErrorResponse` on `!ok`, then `response.json()` with the same `body` / `parse-error` discriminated union, then Zod `safeParse`.

- `src/app/pricing/components/SubscribeButton.tsx` — see ~106–130 (`bodyResult`, `safeParse`, error paths).
- `src/components/billing/ManageSubscriptionButton.tsx` — see ~154–182 (same pattern, portal schema).

Same 15s timeout constant appears in both (plus another 15s in AI timeout config).

- `src/app/pricing/components/SubscribeButton.tsx:44` — `CHECKOUT_TIMEOUT_MS = 15_000`
- `src/components/billing/ManageSubscriptionButton.tsx:11` — `PORTAL_TIMEOUT_MS = 15_000`

**`getErrorMessage(error, fallback)` — identical one-liner in three client files**

- `src/app/pricing/components/SubscribeButton.tsx:24–26`
- `src/app/settings/profile/components/ProfileForm.tsx:82–84`
- `src/components/billing/ManageSubscriptionButton.tsx:38–40`

**`isAbortError` — duplicated and inconsistent with the canonical helper**

Central implementation: `src/lib/errors.ts:6–33` (`isAbortError`).

Narrower / different local versions:

- `src/app/pricing/components/SubscribeButton.tsx:46–48` — `DOMException` only
- `src/app/settings/profile/components/ProfileForm.tsx:86–88` — `Error` only
- `src/features/billing/subscriptions.ts:25–27` — `Error` only
- `src/features/ai/providers/router.ts:72–77` — `DOMException` OR `Error`

**HTTP status extraction from unknown errors — two similar helpers**

- `src/features/ai/providers/router.ts:36–69` — `getStatusCode`
- `src/features/ai/providers/openrouter-response.ts:257–277` — `getStatusCodeFromError`

**Zod date validation — repeated `Date.parse` / ISO messaging**

- `src/shared/schemas/learning-plans.schemas.ts:71–89` — `startDate` / `deadlineDate` refines
- `src/features/plans/validation/learningPlans.schemas.ts:33–49` — override schemas with similar refines (different optionality / YYYY-MM-DD rules)

**`ProfileForm` local `fetchApi`**

- `src/app/settings/profile/components/ProfileForm.tsx:163–223` — same ideas as other clients (abort, `parseApiErrorResponse`, `safeParse`)

**Existing consolidation (positive note)**

- `coerceUnknownToMessage` centralized in `normalize-unknown` and re-exported; duplicate `getErrorMessage` one-liners sit beside that stack.
- Feature validation barrels (`stripe.ts` re-exporting schemas/types) reduce surface duplication.

**`jscpd`**

- Present in `devDependencies` and `.jscpd.json` (`path`: `src/`, `output`: `./jscpd-report`). Running as configured would **write** under `./jscpd-report` — **not executed** in this read-only audit.

---

## 2) Critical assessment

- **Highest signal:** `isAbortError` drift is not just DRY—it can change behavior (e.g. `SubscribeButton` only treats `DOMException`, not `Error` with `name === 'AbortError'`, unlike `src/lib/errors.ts`). Consolidation reduces complexity **and** risk.
- **`getErrorMessage`:** trivial duplication; codebase already has richer normalization (`coerceUnknownToMessage` in `src/lib/errors/normalize-unknown.ts`).
- **Stripe client requests:** two billing components are structurally parallel; shared helper could remove ~40–60 lines each **if** abstraction stays small. Over-abstracting all `fetch` callers (including `ProfileForm`) could **increase** complexity.
- **`getStatusCode` vs `getStatusCodeFromError`:** merging needs one contract on `status: 0` and `router.ts`’s `> 0` checks — unify only with focused tests.
- **Date Zod blocks:** shared primitives help; blind merge loses optional/YYYY-MM-DD nuance.

---

## 3) Recommendations (confidence)

| Item | Confidence |
|------|------------|
| Import/use `isAbortError` from `@/lib/errors` everywhere; delete local copies | **High** |
| Replace duplicate `getErrorMessage` with one shared helper (or `coerceUnknownToMessage` + fallback) | **High** |
| Extract small `fetchJsonPost` / `clientApiRequest` for checkout + portal (and optionally profile) | **Medium** |
| Unify `getStatusCode` and `getStatusCodeFromError` behind one tested helper | **Medium** |
| Shared Zod helpers for ISO date refinements in `shared/schemas` | **Medium** |
| Run `jscpd` (stdout-only or gitignored output) for quantitative clone map | **Low** (process) |

---

## 4) Brief summary

Strongest DRY wins: **error utilities** (three `getErrorMessage`, five divergent `isAbortError` vs `src/lib/errors.ts`). Next: **structural duplication** between `SubscribeButton` and `ManageSubscriptionButton`. **Status-from-error** logic duplicated in AI provider layer. **Zod date refinements** repeat across `shared` and `features/plans/validation`. **`jscpd` not run** here due to filesystem side effects.
