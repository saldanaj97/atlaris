# Track 7: deprecated-legacy

## 1) Research notes (`filepath:line`)

**Formal deprecation**

- No `@deprecated` / `/** @deprecated */` tags under `src/` (per search).

**“Deprecated” wording**

- `src/features/ai/providers/router.ts:127` — “OpenRouter is now the only provider (Google AI deprecated)” + TODO ~131–132 emergency Google fallback. Gemini still used via OpenRouter elsewhere (`src/shared/constants/ai-models.ts`, `src/features/ai/ai-models.ts`) — wording easy to misread.
- `tests/e2e/pdf-to-plan.spec.ts:88` — doc references removed helper “checkPdfPlanQuota”
- `tests/unit/logging/client.spec.ts` — literal log messages “Deprecated feature” for assertions

**“Legacy” / backward compatibility**

- `src/app/api/v1/plans/[planId]/status/route.ts:16` — JSDoc: status from `generationStatus`, “instead of legacy `job_queue`.” `job_queue` still used (`src/lib/db/queries/jobs/shared.ts`, monitoring, schema) — “legacy” is **local** to this endpoint, not table retired.
- `src/features/billing/tier.ts:31–32` — `getUserTier` “backward compatibility”; imported e.g. `usage-metrics.ts:7,151`
- `src/app/api/v1/plans/[planId]/regenerate/route.ts:193–196` — `generationId` alias for `planId` for clients
- `src/lib/date/relative-time.ts:38` — matches “legacy plan-card helper” behavior
- `tests/unit/utils/relative-time.spec.ts:102` — test name “legacy plan-card”
- `tests/unit/validation/learningPlans.dates.spec.ts:126` — “legacy rollover behavior”
- `tests/unit/api/error-response.spec.ts:47,52,62` — “legacy nested error shape”, `LEGACY_CODE`; `src/lib/api/error-response.ts:131–167`

**Fallback branches (selected)**

- `src/features/ai/providers/router.ts:119–125` — env mock fallback non-prod
- `src/features/ai/providers/openrouter.ts:180` — streaming chunk fallback
- `src/features/ai/model-resolver.ts` — `fallback` / `fallbackReason` as outcomes
- `src/lib/config/env/shared.ts:108–143` — `readInt` / `readBoolean` defaults
- `src/lib/api/error-response.ts:131–167` — nested JSON tolerance
- `src/app/pricing/page.tsx:77,111` — static fallback pricing when Stripe fetch fails

**Feature flags / env**

- `src/instrumentation.ts:4` — `ENABLE_SENTRY`
- `src/lib/config/env/ai.ts:115–118` — `AI_USE_MOCK` / mock scenarios

**Other stale-intent markers**

- `src/app/layout.tsx:26–34` — TODO + commented favicon metadata
- `src/app/settings/integrations/components/IntegrationGrid.tsx:17–19` — Google Calendar “on hold” copy

---

## 2) Critical assessment

- Many “fallback” hits are normal engineering (Suspense, errors, config, streaming).
- **`router.ts` Google comment + TODO:** may be **orphaned planning** unless non-OpenRouter path still intended.
- **`job_queue` “legacy” in status route:** locally true; word **overstates** globally given ongoing usage.
- **Compat exports (`getUserTier`, `generationId`):** debt if only internal — audit callers before removal.
- **Nested API error parsing:** deliberate compat — stale only if no producer emits shape.

---

## 3) High / Medium / Low

| Level | Item |
|-------|------|
| **High** | `router.ts:127–132` — misleading “Google AI deprecated” + TODO |
| **Medium** | `status/route.ts:16` vs ongoing `job_queue` — clarify wording |
| **Medium** | `tier.ts:31–32`, `regenerate/route.ts:193–196` — shims; remove only after contract verification |
| **Low** | `relative-time.ts:38` + tests; `error-response` “legacy” tests; `layout.tsx` favicon TODO; e2e historical comment |

---

## 4) Summary

No formal `@deprecated` in app TS. Legacy surface = **comments, API aliases, error-shape normalization**. Strongest cluster: **AI router** commentary vs how Gemini is still exposed via OpenRouter. **Status route** `job_queue` note vs active schema usage. **Env toggles** (`ENABLE_SENTRY`, `AI_USE_MOCK`) look **current**.
