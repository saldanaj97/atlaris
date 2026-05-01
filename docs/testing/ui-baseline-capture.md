# UI baseline screenshots

Trustworthy marketing + product captures for UI audits. **Not** part of `pnpm test:smoke` (smoke stays launch-blocker only; see [Playwright local smoke](./playwright-local-smoke.md)).

## Command

```bash
pnpm ui:capture-baseline
pnpm ui:capture-baseline -- --out=screenshots/frontend-baseline-2026-04-27
```

## Infra (default)

- Ephemeral Postgres (Testcontainers), migrate + smoke seed (same as smoke).
- Two `next dev --turbopack` instances: **anon** `http://127.0.0.1:3100`, **auth** `http://127.0.0.1:3101` (same env contract as smoke).

**Requires:** Docker running, Playwright Chromium (`pnpm exec playwright install chromium`).

## Existing servers (optional)

When both URLs already run the correct modes:

```bash
pnpm ui:capture-baseline -- \
  --anon-base=http://127.0.0.1:3100 \
  --auth-base=http://127.0.0.1:3101
```

## Output

Under the chosen directory (default `screenshots/frontend-baseline-<YYYY-MM-DD>/`, repo-ignored):

- PNGs per route × viewport × variant (`viewport` = first screen, `fullPage` = full scroll). **`fullPage` width** may exceed viewport by up to a few pixels (scrollbar gutter); **`viewport` variant** must match viewport size exactly (script validates).
- `manifest.json` with dimensions and any capture errors.

Viewports: **desktop** 1440×1000, **tablet** 834×1112, **mobile** 390×844.

Routes: anon — `/landing`, `/about`, `/pricing`, `/auth/sign-in`, `/auth/sign-up`; auth — `/dashboard`, `/plans`, `/plans/new`, `/analytics/usage`, `/settings/profile`.

Script: [`scripts/ui/capture-baseline.ts`](../../scripts/ui/capture-baseline.ts).
