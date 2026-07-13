# Playwright Local Smoke Testing

## Purpose

This repo’s committed browser smoke lane exists to prove the launch-blocker flows against a disposable local runtime:

- one ephemeral Postgres container per `pnpm test:smoke` run
- Playwright-managed Chromium (`workers: 1`, no project-level parallelism)
- separate anonymous and authenticated app **modes** (different env, ports, and `distDir`s)
- at most **one** `next dev --turbopack` process alive at a time during normal runs (see [Memory and local resources](#memory-and-local-resources))
- no `.env.local` mutation

Use it for narrow, high-signal browser confidence. Do not turn it into a broad matrix suite.

For **UI audit / marketing vs product screenshot baselines**, use [UI baseline capture](./ui-baseline-capture.md) instead (`pnpm ui:capture-baseline`).

## Command Surface

```bash
pnpm test:smoke
pnpm test:smoke -- --project smoke-anon
pnpm test:smoke -- --project smoke-auth
pnpm test:smoke -- --project smoke-clerk
```

For day-to-day iteration on a machine with limited RAM, prefer a single `--project` (see [Memory and local resources](#memory-and-local-resources)). `smoke-anon` is the lightest path (API `request` checks only, anon server).

Low-level smoke debugging stays available without extra package scripts:

```bash
pnpm exec tsx scripts/tests/smoke/run.ts --smoke-step=db
SMOKE_STATE_FILE=/path/state.json pnpm exec tsx scripts/tests/smoke/start-app.ts --mode=anon
SMOKE_STATE_FILE=/path/state.json pnpm exec tsx scripts/tests/smoke/start-app.ts --mode=auth
```

## Ownership

- `scripts/tests/smoke/run.ts`
  - starts and tears down the disposable Postgres container
  - runs migrations (via `drizzle-kit` CLI invoked with Node — does not require `pnpm` on `PATH` for the migration subprocess), grants, and local smoke seeding
  - writes `SMOKE_STATE_FILE`
  - clears `.test-dist/next-smoke-anon` and `.test-dist/next-smoke-auth` before Playwright (avoids stale Turbopack cache inflating memory)
  - invokes Playwright; a **full** run (no `--project` after `--`) is split into sequential invocations so only one app server is alive at a time (see below)
- `scripts/tests/smoke/start-app.ts`
  - starts `next dev --turbopack` in `anon` or `auth` mode
  - injects the smoke-owned env layer (`SMOKE_NEXT_DIST_DIR` per mode)
- `tests/helpers/smoke/`
  - owns shared smoke runtime modules: DB prep, container lifecycle, mode env config, state files, and seed verification
- `playwright.config.ts`
  - defines the `smoke-anon`, `smoke-auth`, and `smoke-clerk` projects
  - starts only the app server(s) required by the selected `--project` filter (anon/clerk → `:3100`; auth → `:3101`; no filter → both definitions exist, but the wrapper runs projects in server groups so only one Turbopack process is up at a time)
  - keeps the local runner serial with `workers: 1` for stability on resource-constrained machines
  - writes traces, screenshots, and other artifacts under `tests/test-results/playwright/artifacts`
- `next.config.ts` (smoke only)
  - when `SMOKE_NEXT_DIST_DIR` is set, disables Turbopack’s dev filesystem cache (`experimental.turbopackFileSystemCacheForDev: false`) to cap memory; normal `pnpm dev` is unchanged
- `tests/playwright/smoke`
  - owns committed browser smoke specs only

## Mode Contract

- `smoke-anon`
  - `DEV_AUTH_USER_ID=''`
  - `LOCAL_PRODUCT_TESTING=false`
  - app server on `http://127.0.0.1:3100`
- `smoke-auth`
  - uses the seeded local smoke user id
  - `LOCAL_PRODUCT_TESTING=true`
  - deterministic AI smoke env
  - app server on `http://127.0.0.1:3101`

`smoke-auth` intentionally does not load Clerk browser JS. It proves authenticated
product launch blockers against local auth, Clerk Billing fixture state, mock AI,
and disposable Postgres.

Never combine `LOCAL_PRODUCT_TESTING=false` with a non-empty `DEV_AUTH_USER_ID` in
development — the app fails fast on that mixed identity. Real Clerk development
checkout verification is opt-in/manual; see
[Clerk development checkout](../development/environment.md#clerk-development-checkout-fixture-vs-real-payment-flow).

Clerk auth parity is isolated in `smoke-clerk`. It runs against the anonymous
server and skips unless a real Clerk test user is configured. Prefer a
`+clerk_test` email address, then run:

```bash
CLERK_E2E_USER_EMAIL='e2e+clerk_test@example.com' pnpm test:smoke -- --project smoke-clerk
```

The helper path is `clerk.signIn({ page, emailAddress })`, which uses Clerk’s Backend API token flow when `CLERK_SECRET_KEY` is available and bypasses verification/MFA prompts.

Do not start smoke servers manually for normal runs. Let Playwright own them.

## Memory and local resources

Smoke is intentionally small (three specs, one browser worker, `video: 'off'`), but the **infrastructure around Playwright** dominates RAM on a laptop:

| Component | Typical impact | Notes |
| --- | --- | --- |
| `next dev --turbopack` | Largest | One Next 16 dev server with React Compiler + Workflow plugin; on-demand compilation during auth journeys can spike further |
| Docker Postgres (Testcontainers) | Moderate | One `postgres:17-alpine` container per run |
| Chromium + Node orchestration | Small | Single worker; traces/screenshots only on failure |

Historically, a full `pnpm test:smoke` started **two** Turbopack dev servers at once (anon on `:3100`, auth on `:3101`) even though tests run serially. That could push total usage into swap on 16–24 GB machines. The lane now mitigates that without changing coverage:

1. **Single-project runs** — `pnpm test:smoke -- --project <name>` starts only the server that project needs (`playwright.config.ts` resolves `webServer` from `--project`).
2. **Full runs** — `scripts/tests/smoke/run.ts` runs Playwright twice in sequence: first `smoke-anon` + `smoke-clerk` (anon server only), then `smoke-auth` (auth server only). Postgres stays up for the whole run; only the Next process swaps.
3. **Smoke-only Turbopack cache** — dev filesystem cache is off when `SMOKE_NEXT_DIST_DIR` is set; `.test-dist/next-smoke-*` is cleared before each run.

**Recommended iteration commands (lowest RAM first):**

```bash
pnpm test:smoke -- --project smoke-anon    # anon server only; no browser page work
pnpm test:smoke -- --project smoke-auth    # auth server only; heaviest browser journey
pnpm test:smoke -- --project smoke-clerk   # anon server only; needs Clerk env when not skipped
pnpm test:smoke                            # full lane; two sequential Playwright invocations
```

**Reports on a full run:** both invocations write to the same HTML report folder (`tests/test-results/playwright/playwright-report`). The second invocation’s HTML report replaces the first’s on disk. Console output from the `list` reporter is complete for both; failure traces and screenshots remain under `tests/test-results/playwright/artifacts`.

**Not covered by these mitigations:** `pnpm ui:capture-baseline` still starts both dev servers by design (see [UI baseline capture](./ui-baseline-capture.md)).

Do not re-enable concurrent dual dev servers or project-level Playwright parallelism without measuring RAM and documenting why. `workers: 1` and serial auth specs stay the default for stability.

## What Belongs Here

- protected-route redirect checks
- core authenticated journeys
- Clerk Billing pricing and billing settings surfaces
- settings persistence sanity

## What Does Not Belong Here

- full route crawls
- large negative-case matrices already covered lower in the stack
- API-only auth tests
- styling or layout assertions
- flaky sleep-based waits

## Spec Design Rules

- Use Playwright `request` for redirect and proxy assertions.
- Use Playwright `page` for real user journeys.
- Keep the authenticated lane deterministic and serial.
- Keep the overall local runner serial unless there is a concrete reason, enough machine headroom, and a documented RAM measurement to re-enable project-level parallelism or concurrent dual dev servers.
- Prefer existing headings, labels, and aria labels over DOM-shape selectors.
- Create data through the UI when the product flow depends on it.
- If a flow is load-only in the product, keep it load-only in smoke.

## Adding New Coverage

1. Decide whether the flow is truly launch-blocker or regression-prone enough for smoke.
2. Keep it independent of unrelated prior auth mutations.
3. Reuse helpers in `tests/playwright/smoke/fixtures.ts` or `tests/playwright/smoke/helpers/` when they simplify behavior without hiding intent.
4. Update **`tracker.md`** under the current local day's `.agents/recaps/MM-DD-YYYY/plans/playwright-local-smoke/` folder with what changed and how it was verified (create folder/file if missing). Do not mirror smoke planning notes into legacy `prds/`, legacy `.plans/`, flat `.agents/plans/`, flat `.agents/handoffs/`, or Cursor-native `.cursor/plans/`.

## Debugging

- Prefer `pnpm test:smoke -- --project smoke-anon` for redirect and anonymous-access coverage (lowest RAM; single anon server).
- Use `pnpm test:smoke -- --project smoke-auth` when iterating on authenticated flows (single auth server; expect higher compile/RAM use during plan generation).
- Use a full `pnpm test:smoke` only when you need all projects; it runs sequentially with one Turbopack server at a time (slower wall clock, lower peak RAM than the old dual-server default).
- Use `pnpm exec tsx scripts/tests/smoke/run.ts --smoke-step=db` when you only need to prove the disposable Postgres lifecycle, migrations, grants, and smoke seeding.
- Use Playwright traces and failure screenshots before touching selectors.
- Use `scripts/tests/smoke/start-app.ts` directly only when debugging launcher behavior and only with a valid `SMOKE_STATE_FILE` from the smoke wrapper.
- If startup fails, verify Docker is running and Playwright Chromium is installed:

```bash
pnpm exec playwright install chromium
```
