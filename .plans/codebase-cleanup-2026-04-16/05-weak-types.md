# Track 5: weak-types

## 1) Research notes (counts + hotspots)

### `: any` / `as any`

- **`: any`:** **0** real matches. One JSDoc prose mention: `src/lib/api/parse-json-body.ts:10`
- **`as any`:** **0** under `src/`

### `Function` type

- **TypeScript `Function`:** **0** uses
- False positive: `` `[Function: ${...}]` `` string in `src/lib/errors/normalize-unknown.ts:67`

### `unknown`

- **`: unknown` annotations:** ~**190** matches under `src/`
- Heavy in API/error plumbing, AI streaming, hooks (`catch (error: unknown)`), DB helpers — mostly **boundary typing**

**Hotspot samples**

- `src/lib/api/errors.ts` — `details?: unknown`, `cause?: unknown`, `logMeta?: Record<string, unknown>`
- `src/features/ai/parser.ts` — `ensureString` / `ensureNumber` / `JSON.parse` on `unknown`
- `src/app/api/v1/plans/stream/route.ts` — payload logging, `serializeError` on `unknown`
- `src/lib/db/service-role.ts` — proxy getters return `unknown` then cast (lazy-init pattern)

### `Record<string, unknown>`

- ~**56** matches under `src/`
- Clusters: logging, API errors, plan lifecycle (`lifecycle/types.ts`, `ports.ts`, adapters), streaming, billing, PDF proof

**Representative lines**

- `src/features/plans/lifecycle/types.ts:35,199` — `body` / `metadata`
- `src/features/plans/lifecycle/adapters/generation-adapter.ts:64,74` — `metadata` with `as Record<string, unknown>`
- `src/lib/api/error-response.ts:88–92` — `asObject()` narrowing
- `src/lib/db/queries/helpers/attempts-db-client.ts:20` — `db as Record<string, unknown>` after guards

### `as unknown as` (double assertion)

- **6** lines, **5** files:

  - `src/features/billing/subscriptions.ts:207`
  - `src/features/billing/local-stripe.ts:113,135`
  - `src/app/api/v1/stripe/local/complete-checkout/route.ts:68`
  - `src/features/pdf/security/mock-av-provider.ts:29`

### Other

- **`@ts-expect-error` / `@ts-ignore`:** **0** in `src/`

---

## 2) Critical assessment

Tree **strong on avoiding `any`**. Residual weakness: **structured looseness at boundaries**:

1. `Record<string, unknown>` for metadata/body — correct for opaque JSON but doesn’t encode allowed keys; downstream casts/validation needed.
2. `as unknown as` in billing/local Stripe — type model mismatch with SDK/test doubles.
3. `unknown` + structural casts — idiomatic when guarded; risk when copied incompletely.

---

## 3) Recommendations

### High

- Review **`as unknown as Stripe.*`** and subscription field access — prefer narrowed interfaces, runtime validation, or adapter types.
- Plan lifecycle **`body` / `metadata`:** versioned Zod schemas or narrow interfaces at HTTP boundary.

### Medium

- Centralize repeated **error-like narrowing** (`message`/`stack`/`code`) in one helper.
- **`generation-adapter.ts` metadata:** align with `CanonicalAIUsage` / provider metadata so `Record<string, unknown>` cast shrinks or disappears.

### Low

- JSDoc in `parse-json-body.ts:10` — optional rephrase to avoid “any” grep noise.
- Proxy `unknown` in `service-role.ts` — acceptable unless stricter proxy typing is worth the complexity.

---

## 4) Summary

**No meaningful `any` / `as any`.** ~**190** `unknown`, ~**56** `Record<string, unknown>` at I/O and logging boundaries — generally appropriate. Main tighten targets: **6** `as unknown as` lines (Stripe/local billing, mocks) and **long-lived open metadata** on plan lifecycle (replace with schemas/types).
