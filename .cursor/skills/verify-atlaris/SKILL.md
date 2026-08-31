---
name: verify-atlaris
description: Drive the Atlaris web app the way a user does — isolated local Next.js on :3100/:3101, Cursor browser tools, screenshots plus ARIA snapshots. Use when proving a UI change, checking a user journey, or capturing evidence that a feature works.
---

# verify-atlaris

Atlaris is a Next.js 16 web app (Clerk auth, local product-testing bypass, Supabase Postgres). The primary surface is the browser. CLI and API are secondary; do not treat `curl` of an internal route as proof of a UI change.

This skill is for **ad-hoc proof while working**. Committed regression coverage is `pnpm test:smoke` (see `docs/testing/playwright-local-smoke.md`). Do not substitute a green smoke suite for driving the mapped feature you just changed.

Read `features/README.md`, then the matching feature file, before touching the app.

## Launch

Docker must be running. Isolated verification uses the same disposable Postgres + `next dev --turbopack` contract as smoke:

| Mode | URL | Who |
| --- | --- | --- |
| `anon` | `http://127.0.0.1:3100` | signed-out marketing + Clerk sign-in |
| `auth` | `http://127.0.0.1:3101` | local product-testing user (`LOCAL_PRODUCT_TESTING`, mock AI) |

```bash
./node_modules/.bin/tsx scripts/verify-atlaris/control.ts launch --mode=anon
./node_modules/.bin/tsx scripts/verify-atlaris/control.ts launch --mode=auth
```

Launch fills missing env from `.env.agents` then `.env.local` (Clerk needs `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`). Ready when stdout contains `VERIFY_READY`. First compile can take up to 180s. Keep the launch process alive; it is the supervisor that owns the Postgres container. Repeated 5xx on the mode home route fails the launch (usually missing Clerk keys).

**Do not** drive the operator's `pnpm dev` on `:3000`. **Do not** start a second verify instance while one is healthy. If `:3100` or `:3101` is owned by some other process, control refuses rather than hijacking.

`auth` is fixture checkout (`LocalPricingPreview`, disabled buttons), not live Clerk Billing. Real Clerk checkout is out of scope here.

## Doctor

Run this first whenever anything looks off:

```bash
./node_modules/.bin/tsx scripts/verify-atlaris/control.ts doctor
```

Pass means: supervisor pid alive, our port listening, and anon `/dashboard` is a `307` to `/auth/sign-in` (auth `/dashboard` is 2xx). `/landing` 5xx is a warn: marketing pages need a real `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in `.env.local`. Fail means cleanup + relaunch, not "try the user's server".

## Drive

Use the Cursor browser tools (`cursor-ide-browser`): `browser_navigate` → `browser_lock` → `browser_snapshot` → click/type by accessible name from the snapshot → `browser_take_screenshot`. Unlock when finished.

Prefer roles and accessible names from the feature map over CSS, coordinates, or tab order. Start every recipe from the feature file's preconditions.

Do not call test-only endpoints or set client state from the console to fake a user action. Create data through the UI when the product flow depends on it.

## Evidence

Save under `.cursor/skills/verify-atlaris/artifacts/<run-id>/<feature-id>/`. Proof artifacts **survive cleanup**.

| Kind | What |
| --- | --- |
| Action | ARIA snapshot (or curl `-D` headers for redirects) taken **at the click/submit**, not only the final screen |
| Result | Screenshot with Atlaris identity visible (logo or page heading) plus a second snapshot/read of the resulting state |
| Side effect | For mutations: reopen the record from a list/detail route, or a second signed-in view. A toast alone is not proof |

Mocks: `auth` mode uses mock AI and fixture billing. That is the production-local boundary. Do not treat fixture `Preview only` checkout as a paid-subscription proof.

## Cleanup

```bash
./node_modules/.bin/tsx scripts/verify-atlaris/control.ts cleanup
```

Kills the supervisor and app pids recorded in `.cursor/skills/verify-atlaris/.run.json`, then stops that Docker container id. Never `pkill next`. Does not delete `artifacts/`.

## Helpers

All commands from repo root (`./node_modules/.bin/tsx` avoids a pnpm install pass):

```bash
./node_modules/.bin/tsx scripts/verify-atlaris/control.ts launch --mode=anon
./node_modules/.bin/tsx scripts/verify-atlaris/control.ts doctor
./node_modules/.bin/tsx scripts/verify-atlaris/control.ts cleanup
```

Playwright Chromium is only required for `pnpm test:smoke`, not for this skill.
