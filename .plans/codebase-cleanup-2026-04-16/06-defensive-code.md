# Track 6: defensive-code

## 1) Research notes

**Broad try/catch usage**

Many `try/catch` blocks around I/O, Stripe, DB, streaming, JSON — several appropriate.

**Silent / minimal `catch` bodies**

| Location | Pattern |
|----------|---------|
| `src/lib/analytics.ts:71–76` | “Silently handle analytics”; prod: no log |
| `src/app/landing/hooks/useLandingAnalytics.ts:53–57`, `69–73` | gtag / dataLayer |
| `src/features/pdf/extract.ts:100–101` | `catch { return … }` — no logging; failure → heuristic page count |
| `src/features/pdf/extract.ts:104`, `291–293` | `destroy().catch(() => {})` / empty block |
| `src/app/plans/new/components/PdfUploadZone.tsx:41–43` | `catch { return false }` after `arrayBuffer()` |
| `src/features/ai/streaming/events.ts:43–47`, `51–54` | Empty `catch` on `controller.close()` / `controller.error()` |
| `src/features/plans/session/stream-reader.ts:55–62` | Inner catch ignores cancel failures |
| `src/features/ai/abort.ts:44–48` | Empty `catch` on `removeEventListener` cleanup |
| `src/lib/api/error-response.ts:174–185` | `response.json()` failure → fallback payload |
| `src/lib/errors/normalize-unknown.ts` | `JSON.stringify` failure → fallback string |
| `src/features/ai/providers/openrouter.ts:269–273` | `JSON.stringify(reason)` fail → `toString` |
| `src/features/ai/orchestrator/attempt-failures.ts:44–47` | stringify fallback |
| `src/features/ai/usage.ts:52–62` | `computeCostCents` throws → cost `0` with comment |
| `src/app/pricing/components/utils.ts:75–86` | `Intl.NumberFormat` fallback chain |
| `src/lib/db/neon-config.ts:31–41` | `new URL(...)` fail → secure WebSocket default |
| `src/app/api/v1/stripe/_shared/redirect.ts:12–17`, `38–44` | Invalid URL → false / default |
| `src/components/billing/ManageSubscriptionButton.tsx:45–48` | Invalid portal URL → null |
| `src/features/billing/local-stripe.ts:56–61` | Invalid `success_url` → ignore |
| `src/app/api/v1/stripe/webhook/route.ts:123–127` | `JSON.parse` dev payload → 400 |
| `src/features/plans/session/parse-sse-plan-event.ts:35–48` | `JSON.parse` + validation |

**“Log only, no propagate”**

- `src/features/plans/session/stream-outcomes.ts:153–163` — `tryRecordUsage`
- `src/features/plans/session/plan-generation-session.ts:495–499` — DB client cleanup
- `src/components/shared/SiteHeader.tsx:45–56` — tier fetch failure → warn
- `src/features/jobs/regeneration-worker.ts:222–228` — `failJob` failure

**Redundant null guards**

- Repo-wide grep did not surface a single standout “clearly redundant after Zod narrow” without per-flow review — **thin** in this pass.

---

## 2) Critical assessment

- **Analytics** — prod silence is product choice but **hides** misconfig/CSP blocks; dev `console.warn` only.
- **`getPdfPageCount` (`pdf/extract.ts:88–101`)** — bare `catch` lumps failures; **reduces signal** vs `extractTextFromPdf` logging.
- **`parser?.destroy()` swallow** — standard cleanup pattern; **legitimate** with comment.
- **Streams (`events.ts`, `stream-reader.ts`)** — empty/narrow catches match Web Streams semantics — **keep**.
- **`parseApiErrorResponse`** — fallible parsing; fallback reasonable — **keep** (optional debug log).
- **`PdfUploadZone`** — broad `catch` → `false`; low severity unless diagnostics needed.

**Legitimate keep boundaries:** `JSON.parse` on wire, `response.json()`, `new URL()`, Neon env URL, Intl, `JSON.stringify` on arbitrary objects, PDF worker probe, local Stripe URL parse, stream controller lifecycle.

---

## 3) Severity (High / Medium / Low)

**High**

- None mandatory; closest concern is **observability**, not correctness.

**Medium**

- `src/features/pdf/extract.ts:100–101` — silent catch-all for page-count; consider logging/narrowing if used for billing/limits.
- `src/lib/analytics.ts:71–76`, `useLandingAnalytics.ts:53–57`, `69–73` — prod-silent analytics.

**Low**

- `PdfUploadZone.tsx:41–43`
- `pdf/extract.ts:104`, `291–293` — optional debug log on destroy failure
- `src/features/ai/usage.ts:58–61` — swallow to `0`; product review if cost must never be silently zero

---

## 4) Summary

Many **justified** defensive patterns at real boundaries. Main audit findings: **intentional silences** (analytics, PDF page-count fallback) and a few **client read** paths mapping errors to boolean/fallback. **Redundant null guards** need a second pass at Zod/union choke points if desired.
