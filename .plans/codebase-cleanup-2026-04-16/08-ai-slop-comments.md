# Track 8: ai-slop-comments

## 1) Research notes

**Placeholder / tracking TODOs**

- `drizzle.config.ts:5` — env loading
- `src/app/about/components/TeamSection.tsx:9` — `TODO(#228)`
- `src/app/layout.tsx:26` — favicon / uncomment
- `src/features/ai/providers/router.ts:131` — Google fallback

**Comments that narrate git history / refactors**

- `src/features/plans/errors.ts:3–4` — “Moved from features/billing/errors.ts…”
- `src/features/plans/lifecycle/plan-operations.ts:3–5` — “Moved from features/billing/usage.ts…”
- `src/lib/db/service-role.ts:76–82` — “Previously… lazy initialization…”
- `src/features/plans/retry-policy.ts:65–70` — JSDoc “Previously: … Now: …”
- `src/app/api/v1/plans/[planId]/status/route.ts:15–16` — legacy `job_queue` in route doc
- `tests/unit/api/openapi-origin-parity.spec.ts:7–10` — “previously excluded 'pdf'…”
- `src/lib/date/relative-time.ts:37–38` — “legacy plan-card helper”

**Narration / redundant restatement**

- `src/instrumentation-client.ts:1–3` — file-level prose; typo “users loads” on line 3
- `src/features/scheduling/schedule-api.ts:60–66` — long JSDoc mirroring body
- `src/features/scheduling/distribute.ts:25–34` — section comments (`// Input validation`) mirroring structure
- Some error classes: JSDoc repeats class name / obvious behavior (`src/features/plans/errors.ts:8–10`)

**JSDoc duplicates TypeScript (borderline)**

- `src/features/scheduling/schedule-api.ts:22–28` — `@param` / `@returns` on `resolveScheduleTimezone`
- `src/features/scheduling/distribute.ts:13–21` — dense `@param` / `@returns` / `@throws`

**High-signal comments (keep)**

- `src/instrumentation-client.ts:14–18` — WHY `process.env` read directly on client
- `src/lib/db/service-role.ts:1–37` — RLS / security invariants
- `src/lib/api/user-rate-limit.ts:8–9` — deployment caveats

---

## 2) Critical assessment

Repo **not** drowning in junk comments. Findings **localized**: migration/history notes (`Moved from`, `Previously`, `legacy job_queue`) better as commit/ADR. **Schedule** modules show **over-documented** step-by-step JSDoc. **TODOs** sparse, mostly actionable. **`service-role.ts`** heavy but **justified**.

---

## 3) High / Medium / Low

| Level | What |
|-------|------|
| **High** | History-only headers: `errors.ts`, `plan-operations.ts`; `Previously/Now` in `retry-policy.ts`; optional trim of historical paragraph in `service-role.ts` if team agrees git is enough |
| **Medium** | `status/route.ts` doc; openapi parity test history block; `schedule-api` / `distribute` narrative JSDoc and section comments |
| **Low** | `instrumentation-client.ts` opening; `relative-time` legacy one-liner; class JSDoc that only repeats name |

---

## 4) Summary

Sweep finds **small set of refactor-trail and before/after notes** plus **schedule** + **instrumentation-client** over-commenting. **Security/env rationale** comments are **high-signal** and should stay. **TODOs** mostly real backlog. Severity **moderate and patchy**, not systemic.
