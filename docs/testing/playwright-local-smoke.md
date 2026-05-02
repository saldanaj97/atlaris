# Playwright Local Smoke Testing

## Purpose

This repo’s committed browser smoke lane exists to prove the launch-blocker flows against a disposable local runtime:

- one ephemeral Postgres container per `pnpm test:smoke` run
- Playwright-managed Chromium
- separate anonymous and authenticated app servers
- no `.env.local` mutation

Use it for narrow, high-signal browser confidence. Do not turn it into a broad matrix suite.

For **UI audit / marketing vs product screenshot baselines**, use [UI baseline capture](./ui-baseline-capture.md) instead (`pnpm ui:capture-baseline`).

## Command Surface

```bash
pnpm test:smoke
pnpm test:smoke -- --project smoke-anon
pnpm test:smoke -- --project smoke-auth
```

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
  - invokes Playwright
- `scripts/tests/smoke/start-app.ts`
  - starts `next dev --turbopack` in `anon` or `auth` mode
  - injects the smoke-owned env layer
- `tests/helpers/smoke/`
  - owns shared smoke runtime modules: DB prep, container lifecycle, mode env config, state files, and seed verification
- `playwright.config.ts`
  - defines the `smoke-anon` and `smoke-auth` projects
  - starts both app servers on separate ports
  - keeps the local runner serial with `workers: 1` for stability on resource-constrained machines
- `tests/playwright/smoke`
  - owns committed browser smoke specs only

## Mode Contract

- `smoke-anon`
  - `DEV_AUTH_USER_ID=''`
  - `LOCAL_PRODUCT_TESTING=false`
  - `STRIPE_LOCAL_MODE=false`
  - app server on `http://127.0.0.1:3100`
- `smoke-auth`
  - seeded local smoke user id
  - `LOCAL_PRODUCT_TESTING=true`
  - `STRIPE_LOCAL_MODE=true`
  - deterministic AI smoke env
  - app server on `http://127.0.0.1:3101`

Do not start smoke servers manually for normal runs. Let Playwright own them.

## What Belongs Here

- protected-route redirect checks
- core authenticated journeys
- local billing flow
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
- Keep the overall local runner serial unless there is a concrete reason and enough machine headroom to re-enable project-level parallelism.
- Prefer existing headings, labels, and aria labels over DOM-shape selectors.
- Create data through the UI when the product flow depends on it.
- If a flow is load-only in the product, keep it load-only in smoke.

## Adding New Coverage

1. Decide whether the flow is truly launch-blocker or regression-prone enough for smoke.
2. Keep it independent of unrelated prior auth mutations.
3. Reuse helpers in `tests/playwright/smoke/fixtures.ts` or `tests/playwright/smoke/helpers/` when they simplify behavior without hiding intent.
4. Update **`tracker.md`** under [`.agents/plans/playwright-local-smoke/`](../../.agents/plans/playwright-local-smoke/) with what changed and how it was verified (create folder/file if missing).

## Debugging

- Use `pnpm test:smoke -- --project smoke-auth` when iterating on authenticated flows.
- Use `pnpm test:smoke -- --project smoke-anon` when iterating on redirect and anonymous-access coverage.
- Use `pnpm exec tsx scripts/tests/smoke/run.ts --smoke-step=db` when you only need to prove the disposable Postgres lifecycle, migrations, grants, and smoke seeding.
- Use Playwright traces and failure screenshots before touching selectors.
- Use `scripts/tests/smoke/start-app.ts` directly only when debugging launcher behavior and only with a valid `SMOKE_STATE_FILE` from the smoke wrapper.
- If startup fails, verify Docker is running and Playwright Chromium is installed:

```bash
pnpm exec playwright install chromium
```
