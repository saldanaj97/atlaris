# ADR 0004: Request boundary, auth, proxy, rate limits, flags and configuration

- Status: Accepted
- Date: 2026-11-20
- Source: moved here from inline code comments when comments were banned in `src/` (see the `delete-comment` skill). Each entry is the original comment text, grouped by the file it sat in.

## Context

Every request passes through the proxy, the request boundary and, for protected routes, auth and RLS context. Flags, env parsing, rate limits and observability sampling are configured at that edge. The reasoning below was kept in code comments across `src/lib`, `src/proxy.ts`, `src/flags.ts` and the API routes.

## Decisions

### `src/app/api/v1/notifications/email/unsubscribe/route.ts`

- `return htmlResponse` — GET is confirmation-only. Never mutate preferences from scanners/prefetchers.
- `return htmlResponse` — RFC 8058: one-click POST must not redirect.

### `src/app/api/v1/user/preferences/route.ts`

- `async function assertCanPersistGroundedPicks` — Grounded picks are Pro-only, must be in the role's catalog, and are only accepted while grounded generation is on for the user's tier and their Clerk plan has the grounded_model_picks feature.
- `const GET` — GET /api/v1/user/preferences Returns raw saved model slots (nullable, including out-of-tier IDs) plus effective resolved IDs for the current tier, the persistable outline picker list, and the Pro-only models Starter sees disabled. Never writes.

### `src/app/api/v1/user/profile/route.ts`

- `const updatedRows` — updatedAt must use the DB clock (sql`now()`), not `new Date()`, so it shares the same clock as defaultNow() on insert. Otherwise Node-vs-Postgres clock skew can let updatedAt land at or before createdAt under concurrent load and break the strict-monotone assertion in tests/integration/api/user-profile.spec.ts.

### `src/flags.ts`

- `const FLAG_FAILURE_TTL_MS` — How long a failed evaluation is remembered per flag and context. The provider never caches errors, so without this every caller would wait the full request timeout while Flagship or the token is down. Only the failure is cached; a success within the window still comes from the provider.
- `async function evaluateBoolean` — Evaluates a boolean flag. Throws `FlagEvaluationError` when Flagship reports an error (missing flag, type mismatch, network) or when a hosted deployment has no provider configured, so callers can apply their own fail-safe. A failure is rethrown without a provider call until `FLAG_FAILURE_TTL_MS` passes.
- `const jobsPaused` — Pause every jobs Worker job (Worker only; callers fail open).
- `const regenerationPaused` — Stop accepting plan regeneration requests (app only; callers fail open).
- `const parallelDirectResearch` — Plan research searches Parallel directly instead of OpenRouter `web_search` (Worker only).

### `src/instrumentation-client.ts`

- `const sendDefaultPii` — NOTE: We read `process.env` directly here instead of importing from `@/lib/config/env` because that module eagerly validates server-only secrets (CLERK_SECRET_KEY, POSTGRES_URL, etc.) at import time, which would throw in this client-side instrumentation bundle. NEXT_PUBLIC_* vars are also not exposed through the server env config.
- `sendDefaultPii,` — Intentionally gated: enable PII forwarding only with explicit opt-in via env. https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
- `disable_session_recording: true,` — Session recording is intentionally off (legal/CIPA); do not enable it.
- `console.warn` — Warn only when an explicit production deployment is misconfigured.

### `src/lib/api/auth.ts`

- `async function getEffectiveAuthUserId` — Returns the effective auth user id for the current request. In development or test (Vitest), if DEV_AUTH_USER_ID is set, that value is returned (allowing you to bypass real Clerk auth provisioning while seeding a deterministic user).
- `async function getAuthUserId` — Returns the auth user id from the actual Clerk session, ignoring DEV_AUTH_USER_ID overrides. This is intended for security-sensitive flows (e.g. OAuth callbacks) where we must validate the currently authenticated end user rather than a test/development override. Only call from Route Handlers or Server Actions (not Server Components). @public Intentional library surface for OAuth and security-sensitive flows (see docs).
- `assertSameOriginMutation` — Before auth, so a cross-site mutation never reaches the handler (DEV-208).

### `src/lib/api/error-response.ts`

- `function normalizeApiErrorResponse` — Normalize a JSON error body into the canonical {@link ApiErrorResponse}. The wire contract (documented in `src/lib/api/openapi.ts errorResponseSchema`) is a flat object: `{ error, code, classification?, details?, retryAfter? }`. If a third-party proxy ever emits a nested `{ error: { message } }` shape, the message degrades gracefully to `fallbackMessage` rather than digging into the nested object.

### `src/lib/api/errors.ts`

- `function redactStackTrace` — Strips absolute file paths from stack traces to prevent internal directory structure disclosure in log aggregators. Preserves the function name and relative path for debuggability.

### `src/lib/api/internal/internal-worker-token.ts`

- `function tokensMatch` — Compares expected secret to provided token using timing-safe equality on min(length) bytes; returns true only when lengths also match.

### `src/lib/api/ip-rate-limit.ts`

- `function getClientIp` — Extracts client IP address from a request, handling proxies correctly. IP extraction priority: 1. X-Forwarded-For header (mode depends on IpExtractionConfig) 2. X-Real-IP header 3. CF-Connecting-IP (Cloudflare deployments) 4. Falls back to 'unknown' if no IP can be determined Trust modes: - leftmost: first IP in the chain (Vercel-friendly default) - rightmost-untrusted: traverse right -> left, trim trusted proxies from the right edge, then return the first untrusted IP encountered - trusted-proxies: traverse left -> right and return the first IP in the chain that is not trusted Example chain: "spoofed-client, real-client, trusted-proxy" - rightmost-untrusted => "real-client" - trusted-proxies => "spoofed-client" Prefer rightmost-untrusted when you trust only known right-edge proxies. @param request - The incoming HTTP request @param config - Optional extraction config for proxy trust model @returns The client IP address or 'unknown' if not determinable

### `src/lib/api/openapi.ts`

- `extendZodWithOpenApi` — Initialize OpenAPI extension for Zod (must be called once)

### `src/lib/api/parse-json-body.ts`

- `maxBytes?: number;` — Optional actual-byte cap. When omitted, parsing stays on unbounded `req.json()`. When set, oversized `Content-Length` may reject early; the streamed body is still counted in bytes so missing, malformed, or understated headers cannot bypass the cap.
- `function hasJsonMediaType` — A body is parsed only when it is declared as JSON, so a cross-site `text/plain` form or fetch cannot reach a JSON route (DEV-208, lead 4).

### `src/lib/api/rate-limit-core.ts`

- `import type` — Shared sliding-window rate limiter backed by an LRU cache. Both ip-rate-limit.ts and user-rate-limit.ts delegate to this core implementation. Keeping a single algorithm avoids drift between the two modules and makes the window logic easier to test in isolation.

### `src/lib/api/rate-limit.ts`

- `function exceededPlanGenerationWindowTiming` — When durable attempt query failed: full-window backoff. Otherwise: time until oldest attempt ages out.
- `logger.error` — Fail-closed: when we cannot verify the count, treat as rate-limited to prevent abuse when DB is unavailable (expensive AI calls).

### `src/lib/api/request-boundary.ts`

- `checkUserRateLimit` — Match `withRateLimit` (`ctx.userId`): Clerk auth ID, not `users.id`.

### `src/lib/api/request-origin.ts`

- `function assertSameOriginMutation` — Browser-origin check for mutating requests (DEV-208, lead 4). Prefers Sec-Fetch-Site (set by every current browser, never by a page), then falls back to Origin. A request with neither header is not from a browser and passes; the session cookie is still required by withAuth. `same-site` is rejected on purpose: no sibling host under the registrable domain calls these routes.

### `src/lib/api/user-rate-limit.ts`

- `import type` — User-based rate limiting for authenticated endpoints. This module provides rate limiting keyed by user ID rather than IP. It's designed to prevent authenticated users from overwhelming the system, regardless of whether they're paying customers. IMPORTANT: Storage scope and deployment considerations - Uses an in-memory LRU cache per process (same caveats as ip-rate-limit.ts). - In multi-instance deployments, each instance enforces its own limits. - For strict per-user limits across instances, consider Redis-backed storage. Design principles: - Limits are categorized by endpoint "cost" (high/medium/low). - High-cost endpoints (AI generation, exports) have strict limits. - Low-cost endpoints (reads) have permissive limits. - All limits are per-user, not per-IP (authenticated context required).
- `aiGeneration:` — HIGH COST - AI generation, regeneration, content enhancement These endpoints call external AI providers and can be expensive. Strict limits to prevent runaway costs and abuse.

### `src/lib/auth/local-identity.ts`

- `function getShellAuthUserId` — Resolves the auth user id for shell/header UI when local product testing uses `DEV_AUTH_USER_ID` without a real Clerk session. Otherwise uses the session user id.

### `src/lib/auth/server.ts`

- `async function hasClerkPlanFeature` — Whether the Clerk session for `authUserId` has a plan feature. A signed-out request, or a session for another user (a DEV_AUTH_USER_ID override), has none. Throws when Clerk auth is unavailable, so callers can tell that apart from a missing feature.

### `src/lib/config/env/ai.ts`

- `interface ParallelEnv` — Parallel Search API configuration for direct plan research (DEV-171).

### `src/lib/config/env/database.ts`

- `get nonPoolingUrl` — Prefer the non-pooling URL when available for migrations and direct clients.
- `get directUrl` — Direct (non-pooled) URL for clients that hold session state. Unlike `nonPoolingUrl` it never falls back to `POSTGRES_URL`, which is the pooled URL on hosted deploys: `SET ROLE` and `request.jwt.claims` are session state that a transaction-mode pooler drops between statements.

### `src/lib/config/env/email.ts`

- `function getRequiredEmailUnsubscribeTokenSecret` — Requires an unpadded base64url secret encoding at least 32 random bytes. The format is shared by email delivery and public unsubscribe verification.

### `src/lib/config/env/flagship.ts`

- `readonly appId: string | undefined;` — Backend Flagship app ID (`cf flagship apps list`). Named "backend" in the env so a separate frontend flags app can be added later.
- `readonly isConfigured: boolean;` — All three values are set, so flags can be evaluated over HTTP.

### `src/lib/config/env/posthog.ts`

- `interface PostHogEnvironment` — PostHog is enabled only for an explicit production deployment. Vercel Preview and custom environments run with NODE_ENV=production, so NODE_ENV alone cannot identify a production deployment. VERCEL_TARGET_ENV takes precedence over VERCEL_ENV when a custom environment is configured.

### `src/lib/config/local-product-testing.ts`

- (file or block level) — Local product-testing mode — explicit contract for development and automated tests only. **Not** hosted auth/session parity: staging remains the source of truth for real Clerk Auth and OAuth. This mode coordinates seeded DB users with `DEV_AUTH_USER_ID` as a local identity selector. ## Config precedence (how this relates to other env vars) - **`LOCAL_PRODUCT_TESTING`** — Master switch for “I am using the local product-testing workflow” (bootstrap + seeded user + docs). Refused at process startup in production. It does **not** replace per-feature flags; those keep their meaning: - **`DEV_AUTH_USER_ID` / `DEV_AUTH_USER_*`** — Select which seeded `users.auth_user_id` row the server treats as the effective user in development/test (when set). Must match an existing user row; use {@link LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID} with bootstrap. - **`AI_PROVIDER`** — AI runtime behavior. It accepts `mock` or `router` (or unset for the environment default). - **Billing fixtures** — use `pnpm db fixture` to seed local subscription state. Prefer reading feature behavior from the grouped configs in `@/lib/config/env` rather than `process.env` directly.

### `src/lib/errors.ts`

- `function assertNever` — Exhaustive check helper for discriminated unions. Passing a value of type `never` ensures all cases are handled at compile time.

### `src/lib/observability/sampling.ts`

- `function getEnvironment` — Resolve the current runtime environment. Works on both client (inlined at build time) and server (runtime). NOTE: We intentionally read `process.env.NODE_ENV` directly instead of importing from `@/lib/config/env`. That module eagerly validates server-only secrets (e.g. CLERK_SECRET_KEY) at import time, which would throw in client bundles and Sentry edge/instrumentation configs that load before the full server environment is available.
- `function tracesSampler` — Sentry `tracesSampler` — replaces the flat `tracesSampleRate` with context-aware decisions. The function receives the sampling context from Sentry and returns a number between 0 and 1 (or boolean) indicating the probability that the trace should be recorded. Exported as a standalone pure function so it can be unit-tested without booting Sentry.
- `if` — Inherit parent sampling decision for distributed traces so child spans are never orphaned from their parent.

### `src/lib/posthog-server.ts`

- `function getPostHogClient` — Returns a singleton PostHog server-side client. Uses flushAt=1 and flushInterval=0 so events send promptly. Route handlers are still short-lived — call `captureAfterResponse` so capture+flush run in `after()` and do not block the mutation response. Returns null when the project token is missing so callers can skip capture without breaking the request. Host may be omitted; the Node SDK then uses the same US Cloud ingest origin as the `/ingest` proxy.
- `function captureAfterResponse` — Capture a server event after the HTTP response is sent. `distinctId` is always Clerk `authUserId` so it matches `posthog.identify(user.id)` in PostHogUserIdentifier.

### `src/lib/posthog/delete-person.ts`

- `const POSTHOG_BULK_DELETE_URL` — The production PostHog project (US cloud). PostHog runs only in Vercel Production, so every person to delete lives here.
- `async function deletePostHogPersons` — Queues deletion of the PostHog persons for these Clerk user ids, with their events and recordings. The distinct id is the Clerk user id, matching identify(). Returns whether PostHog accepted the request; never throws.

### `src/lib/proxy/middleware-policy.ts`

- `if` — Payment/auth provider webhooks bypass Clerk; route-level signatures apply.
- `if` — One-click unsubscribe authenticates via signed token, not Clerk.
- `if` — Internal worker/maintenance routes bypass Clerk; each route must enforce its own worker token auth (see assertInternalWorkerAccess).
- `if` — Worker health probes authenticate via route-level worker token, not Clerk.
- `function resolveAnonymousAuthPath` — Auth page for a signed-out visitor to a protected route. The landing and pricing calls to action open the plan form, so a visitor there is most likely new and goes to sign-up; Clerk's sign-up page links to sign-in.
- `function isSiteGateExempt` — Paths the site gate never redirects, so the proxy can skip flag evaluation.
- `function resolveSiteGateRedirectSource` — Auth entry point the visitor was heading to, so the gate page can tailor its copy.

### `src/lib/proxy/normalize-pathname.ts`

- `function normalizeProxyPathname` — The path the proxy policy functions compare against. Decodes once, like Next does for route params, so an encoded segment (`/%64ashboard`) cannot differ from the routed one (DEV-208). Returns null, and the proxy answers 400, when the path is not valid percent-encoding or when decoding reveals a `.` or `..` segment. The URL parser already removes literal dot segments before the proxy runs, so one that appears only after decoding came from `%2e` or `%2f` and would make the policy path (`/api/internal/../../dashboard` is internal-exempt) differ from any route a decoding router would pick.

### `src/lib/proxy/site-gate.ts`

- `const SITE_GATE_FALLBACK_CACHE_TTL_MS` — Shorter reuse for a gate built from an env fail-safe: bounds flag reads and Sentry events during an outage.
- `async function resolveGateFlag` — Evaluates a gate flag. If evaluation throws, uses the env fail-safe and reports the outage.
- `const clean` — A clean maintenance read decides the gate alone, so a waitlist fallback cannot change it.
- `async function resolveSiteGate` — Active site gate from Flagship, cached per process: SITE_GATE_CACHE_TTL_MS for a clean read, SITE_GATE_FALLBACK_CACHE_TTL_MS for an env fail-safe. The proxy evaluates the gate flags once per interval, never per request.
- `pendingSiteGate ??` — Concurrent misses share one evaluation, so a slower, older read cannot overwrite a newer one.

### `src/lib/utils/index.ts`

- `const twMerge` — Type roles (`type-*` utilities in globals.css) set size, line height, weight, tracking and family, so a later role replaces earlier type classes.

### `src/proxy.ts`

- `if` — Payment/auth provider webhooks bypass all checks including maintenance mode.
- `if` — Maintenance mode / launch waitlist. Exempt paths never redirect, so skip the flag reads.
- `const siteGate` — Only the waitlist depends on the viewer, so other gates skip the session read.
- `if` — In development, when DEV_AUTH_USER_ID is set, bypass middleware auth for API routes. Clerk does not use this override and would redirect even when the route handler would accept the dev user. Route handlers still run withAuth and use getEffectiveAuthUserId. When LOCAL_PRODUCT_TESTING is enabled, also bypass protected pages so shell and server components match the seeded local identity.
- `async` — clerkMiddleware already authenticated the request, so this adds no network call.
- `async` — No Clerk keys locally, so no session to admit.
- `'/` — Catch-all for app routes. Skip /ingest so the public PostHog proxy stays outside Clerk; that route owns validation.
- `'/` — Protected app prefixes run the proxy whatever their extension, so `/plans/x.txt` cannot reach `plans/[id]` without the gate, CSP, and auth. Keep in step with PROTECTED_PREFIXES in src/lib/proxy/middleware-policy.ts.
- `'/` — Any percent-encoded path runs the proxy too, so `/%70lans/x.txt` cannot dodge both entries above if a host decodes it before routing. The proxy decodes it and rejects dot segments before any policy check.

### `src/shared/analytics/PostHogUserIdentifier.tsx`

- `function PostHogUserIdentifier` — Identifies the authenticated Clerk user in PostHog on mount and whenever the auth state changes. Must be rendered inside ClerkProvider. PII (email, name) goes into PostHog person properties via identify(), not into capture() event properties. Reset clears a persisted identified user on signed-out loads while preserving a genuinely anonymous distinct ID.

### `src/shared/types/client.ts`

- `const PLAN_STATUSES` — Client-friendly (serialized) shapes derived from DB relation models. These flatten nested relations (e.g., TaskResource.resource) and convert Date -> string. Keep separate from component files to avoid server<->client circular deps.

## Consequences

The code no longer carries this rationale inline. A change that would alter one of the behaviors above should update this ADR in the same pull request, and a new non-obvious decision belongs in an ADR, not in a comment.
