# Pre-Launch Security & Abuse-Resistance Audit Checklist (24 Areas)

> **Stack context**: Next.js 16 + React 19 + Clerk auth + Stripe billing + Neon (Postgres + RLS) + OpenRouter AI

---

## SECTION A: Data Layer Security

### 1) Database RLS policies & permission enforcement

- [ ] Verify every table is protected by RLS where required (no "oops, public read/write").
- [ ] Verify user-facing policies include explicit role targets (`TO authenticated`) and never rely on implicit `TO PUBLIC`.
- [ ] Confirm policies enforce tenant isolation (user/org boundaries) under all query paths.
- [ ] Test policy bypass attempts using service-role vs anon/auth contexts.
- [ ] Verify `getDb()` (RLS-enforced) is used in all API routes—never `db` (service-role) in request handlers.
- [ ] Test that RLS policies work correctly with JOINs and CTEs (common bypass vector).
- [ ] Confirm RLS is enforced on UPDATE/DELETE, not just SELECT/INSERT.
- [ ] Audit any `security_definer` functions for privilege escalation.

### 2) Database connection & query security

- [ ] Parameterized queries everywhere—no string interpolation in SQL.
- [ ] Connection pooling configured with appropriate limits (prevent connection exhaustion DoS).
- [ ] Database credentials rotated and not hardcoded anywhere.
- [ ] Neon branch isolation: ensure preview branches can't access production data.
- [ ] Query timeouts configured to prevent long-running query abuse.
- [ ] Audit any raw SQL for injection vectors (especially in search/filter endpoints).

---

## SECTION B: Authentication & Authorization

### 3) Authentication patterns (Clerk-specific)

- [ ] Verify `auth()` or `currentUser()` is called on every protected route/action.
- [ ] Middleware correctly protects route groups (not just individual pages).
- [ ] Clerk webhook signature verification is implemented and tested.
- [ ] Session token validation happens server-side, not just client-side.
- [ ] Handle Clerk session expiry gracefully (don't expose stale auth state).
- [ ] Verify `publicRoutes` in Clerk middleware doesn't accidentally expose sensitive routes.
- [ ] Test that signed-out users can't access protected API routes via direct fetch.

### 4) Authorization & access control

- [ ] Confirm consistent auth checks on every protected action (not just page access).
- [ ] Validate role checks (user/admin/org owner) at the API layer.
- [ ] Ensure no IDOR issues (changing IDs to access other users' data).
- [ ] Resource ownership verified server-side before any mutation.
- [ ] Verify anonymous sessions cannot read or write user-facing plan/module/task data.
- [ ] Test horizontal privilege escalation (user A accessing user B's resources).
- [ ] Test vertical privilege escalation (regular user accessing admin functions).

---

## SECTION C: API Security

### 5) Rate limiting implementation

- [ ] Apply limits per user, per IP, and per token where relevant (not just one dimension).
- [ ] Ensure limits cover expensive endpoints (AI calls, exports, search, uploads).
- [ ] Add burst + sustained controls, and verify consistent behavior across deployments.
- [ ] Rate limit responses include `Retry-After` header.
- [ ] Rate limiting works correctly behind CDN/proxy (use correct client IP header).
- [ ] Separate limits for authenticated vs unauthenticated requests.
- [ ] Rate limit bypass via header spoofing tested and prevented.

### 6) Input validation & injection prevention

- [ ] Validate and sanitize all user inputs (body, query params, headers).
- [ ] Protect against SQL injection, command injection, SSRF, and unsafe URL fetching.
- [ ] Treat "AI-generated" content as untrusted input too.
- [ ] Zod schemas on all API request bodies—reject unknown keys.
- [ ] URL/redirect parameters validated against allowlist (prevent open redirect).
- [ ] File path inputs sanitized (prevent path traversal: `../../../etc/passwd`).
- [ ] JSON parsing has size limits (prevent JSON bomb DoS).
- [ ] Array/object nesting depth limited in request bodies.

### 7) API route security (public vs protected)

- [ ] Inventory every route and explicitly mark public vs authenticated vs admin-only.
- [ ] Ensure internal/admin endpoints aren't exposed via guessable URLs.
- [ ] Confirm middleware/guards are applied consistently (no route exceptions).
- [ ] API versioning doesn't accidentally expose deprecated insecure endpoints.
- [ ] OPTIONS/HEAD methods don't bypass auth checks.
- [ ] Verify no sensitive operations possible via GET requests (all mutations use POST/PUT/DELETE).

### 8) Error handling & information leakage

- [ ] Ensure errors don't leak stack traces, SQL details, provider responses, or secrets.
- [ ] Normalize error responses (don't reveal whether an email/user exists).
- [ ] Scrub logs of tokens, keys, sensitive prompts, and PII.
- [ ] Different error messages for "not found" vs "forbidden" don't leak resource existence.
- [ ] AI provider errors sanitized before returning to client.
- [ ] Validation errors don't reveal internal field names or database schema.

---

## SECTION D: AI-Specific Security

### 9) AI usage controls & cost prevention

- [ ] Enforce quotas and per-tier usage caps (requests, tokens, tool calls).
- [ ] Add spend spike detection and hard cutoffs for abuse patterns.
- [ ] Prevent prompt-based bypass of tool restrictions or hidden "expensive modes."
- [ ] Token counting happens before sending to provider (pre-validation).
- [ ] Model selection validated server-side (user can't request expensive models on free tier).
- [ ] Streaming responses can be cancelled/aborted on quota exceeded.
- [ ] AI usage logged with user ID for billing reconciliation.

### 10) Prompt injection & AI safety

- [ ] User input in prompts is clearly delimited/escaped.
- [ ] System prompts don't contain secrets that could be extracted.
- [ ] AI output treated as untrusted (sanitize before rendering as HTML).
- [ ] Prevent prompt injection via learning plan topics/notes fields.
- [ ] AI-generated URLs/links validated before rendering.
- [ ] Consider output filtering for harmful/inappropriate content.
- [ ] Tool/function calling permissions enforced server-side.

---

## SECTION E: Payment & Subscription Security

### 11) Tier gating & subscription enforcement

- [ ] Confirm paid features cannot be accessed via direct API calls or client-side toggles.
- [ ] Validate entitlements server-side only (never trust UI state).
- [ ] Test upgrade/downgrade edge cases and stale subscription state.
- [ ] Subscription status checked on every gated request (not cached too long).
- [ ] Trial expiry enforced server-side with grace period handling.
- [ ] Cancelled subscriptions: verify access revoked at period end, not immediately.
- [ ] Test subscription status with Stripe test clocks for edge cases.

### 12) Webhook security (Stripe, etc.)

- [ ] Verify signatures on every webhook and reject unsigned/invalid payloads.
- [ ] Add idempotency and replay protection (don't double-process events).
- [ ] Ensure webhook handlers don't trust event order and handle retries correctly.
- [ ] Webhook endpoint not guessable (use random path segment).
- [ ] Webhook processing timeout handling (don't hang on slow operations).
- [ ] Test webhook replay attacks with old valid signatures.
- [ ] Stripe webhook events verified against expected event types (ignore unknown).

---

## SECTION F: Third-Party Integrations

### 13) OAuth & integration security (Google Calendar, Notion)

- [ ] OAuth tokens encrypted at rest in database.
- [ ] Refresh tokens handled securely (not exposed to client).
- [ ] Token refresh failure gracefully handled (re-auth prompt, not crash).
- [ ] Scope requested is minimum necessary (not over-privileged).
- [ ] OAuth state parameter validated to prevent CSRF.
- [ ] Integration disconnect actually revokes tokens (not just deletes local record).
- [ ] Test integration with expired/revoked tokens.

### 14) External API call security

- [ ] Outbound requests use TLS (no HTTP).
- [ ] API keys for external services not logged or exposed in errors.
- [ ] Timeout and retry limits on external calls (prevent hanging requests).
- [ ] SSRF prevention: validate/allowlist any user-provided URLs before fetching.
- [ ] External service failures don't cascade (circuit breaker pattern).

---

## SECTION G: Client-Side & Browser Security

### 15) Secrets & credentials hygiene

- [ ] Ensure no secrets ship to the client bundle (keys, service role tokens, webhook secrets).
- [ ] Enforce env separation (dev/stage/prod) with correct permissions and access.
- [ ] Confirm rotation readiness (document + practice rotating critical keys).
- [ ] `NEXT_PUBLIC_*` env vars audited—none contain secrets.
- [ ] Build output scanned for accidentally bundled secrets.
- [ ] Source maps disabled in production (or access-restricted).

### 16) Session security & token handling

- [ ] Cookie/session flags: Secure, HttpOnly, SameSite=Lax or Strict.
- [ ] Validate refresh token handling, invalidation on logout, and session fixation resistance.
- [ ] Verify JWT validation assumptions (aud/iss/exp) if you handle tokens directly.
- [ ] Clerk session tokens not stored in localStorage (use cookies).
- [ ] Session invalidation on password change/security events.
- [ ] Concurrent session limits if applicable.

### 17) CORS, CSRF & security headers

- [ ] CORS locked down to known origins (no wildcard "because it worked").
- [ ] CSRF strategy correct for your auth method (cookies vs bearer tokens).
- [ ] Add/verify CSP, HSTS, frame-ancestors, Referrer-Policy, Permissions-Policy.
- [ ] X-Content-Type-Options: nosniff
- [ ] X-Frame-Options: DENY (or specific frame-ancestors in CSP)
- [ ] CSP blocks inline scripts (or uses nonces for necessary inline).
- [ ] Subresource Integrity (SRI) on external scripts if any.

### 18) Client-side data exposure

- [ ] React Server Components don't pass sensitive data to Client Components.
- [ ] API responses don't include more data than UI needs (over-fetching).
- [ ] Sensitive data not stored in browser storage (localStorage, sessionStorage, IndexedDB).
- [ ] Form data not persisted in browser history (use POST, not GET for sensitive forms).
- [ ] Autocomplete disabled on sensitive fields where appropriate.

---

## SECTION H: Infrastructure & Operations

### 19) File uploads & content handling (if applicable)

- [ ] Enforce size limits, MIME validation, extension spoofing protections.
- [ ] Signed URL expiry and access checks (no "forever links" to private content).
- [ ] Ensure private bucket/object ACLs and safe rendering (avoid stored XSS).
- [ ] Uploaded content scanned for malware if user-facing.
- [ ] Image processing has resource limits (prevent image bomb DoS).

### 20) Dependency & supply-chain risk

- [ ] Audit dependencies for known CVEs and risky transitive packages.
- [ ] Lockfile integrity: pinned versions, no untrusted git dependencies.
- [ ] Watch for malicious install scripts (postinstall) and CI execution risks.
- [ ] `pnpm audit` runs in CI and blocks on high/critical vulnerabilities.
- [ ] Dependabot or similar enabled for security updates.
- [ ] Review new dependencies before adding (check maintainer, download count, last update).

### 21) Infrastructure, deployment & config hardening

- [ ] Confirm databases/redis/storage are not publicly reachable without strong controls.
- [ ] Enforce TLS, correct redirect rules, and hardened preview/staging environments.
- [ ] Ensure least privilege on cloud/service permissions and CI secrets exposure.
- [ ] Preview deployments don't have production database access.
- [ ] Environment variables not logged during build/deploy.
- [ ] Vercel/deployment platform access restricted to necessary team members.
- [ ] Branch protection rules enforce review before merge to main.

### 22) Logging, monitoring & incident readiness

- [ ] Log auth events, permission denials, suspicious usage, and admin actions.
- [ ] Alert on spend spikes (AI + billing), rate-limit triggers, and error bursts.
- [ ] Redact PII/secrets from logs; maintain audit trails for critical actions.
- [ ] Log retention period defined and compliant with regulations.
- [ ] Incident response runbook exists (who to contact, how to rotate keys, etc.).
- [ ] Ability to quickly revoke all sessions for a user if compromised.
- [ ] Log correlation IDs for request tracing.

---

## SECTION I: Privacy & Compliance

### 23) Data privacy, retention & deletion semantics

- [ ] Verify account deletion actually deletes/anonymizes data (including derived content).
- [ ] Define retention windows for logs, prompts, exports, and backups.
- [ ] Ensure exports and data access requests don't leak cross-tenant data.
- [ ] AI prompts/responses retention policy defined (don't store indefinitely).
- [ ] GDPR/CCPA compliance if applicable (data export, deletion requests).
- [ ] Third-party data sharing disclosed in privacy policy.
- [ ] Analytics/tracking respects user consent preferences.

### 24) Business-logic abuse & race condition testing

- [ ] Test replay, double-submit, concurrency exploits (quota bypass, double credits).
- [ ] Validate state machines (trial → paid → canceled → reactivated) for correctness.
- [ ] Ensure atomic updates where needed (transactions/locks) to prevent inconsistencies.
- [ ] Plan generation: prevent duplicate submissions during streaming.
- [ ] Quota checks atomic with usage increment (no TOCTOU race).
- [ ] Test concurrent requests to same resource (optimistic locking or proper serialization).
- [ ] Referral/promo code abuse prevention (one-time use enforced).

---

## Quick Reference: Critical Checks by Area

| Area             | Must-Have Check                                      |
| ---------------- | ---------------------------------------------------- |
| **Database**     | RLS on all tables, `getDb()` in API routes           |
| **Auth**         | `auth()` on all protected routes, IDOR testing       |
| **API**          | Zod validation, rate limiting, no stack traces       |
| **AI**           | Token limits, prompt injection prevention, cost caps |
| **Payments**     | Server-side tier checks, webhook signatures          |
| **Integrations** | OAuth token encryption, scope minimization           |
| **Client**       | No secrets in bundle, CSP headers                    |
| **Infra**        | No public DB access, dependency audits               |
| **Privacy**      | Working account deletion, retention policies         |
