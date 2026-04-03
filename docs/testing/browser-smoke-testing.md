# Browser Smoke Testing (Historical Reference)

This file is no longer the source of truth for committed browser smoke coverage.

## Current Workflow

Use [playwright-local-smoke.md](/Users/juansaldana/Dev/Projects/atlaris/docs/testing/playwright-local-smoke.md) for the real local smoke architecture, commands, and ownership.

## Why This File Still Exists

Before the committed Playwright smoke lane existed, this repo used manual localhost verification and Chrome DevTools MCP-driven checks to prove launch-blocker flows. That work was useful historically, but it is no longer the primary path.

Historical references that still matter:

- [smoke-test-results-2026-04-01.md](/Users/juansaldana/Dev/Projects/atlaris/docs/testing/smoke-test-results-2026-04-01.md)
- the old manual route checklist and exploratory notes that informed the current Playwright coverage

## What To Do Now

- For committed browser smoke: run `pnpm test:smoke`
- For anonymous-only smoke iteration: run `pnpm test:smoke -- --project smoke-anon`
- For authenticated-only smoke iteration: run `pnpm test:smoke -- --project smoke-auth`
- For disposable DB smoke infra only: run `pnpm exec tsx scripts/smoke/run.ts --smoke-step=db`
- For legacy manual comparison or ad hoc investigation: use the historical notes here only as background, not as the current testing standard

Older revisions of this file contained the pre-Playwright manual checklist. That content is intentionally no longer maintained here. If you need it, inspect git history instead of treating this file as active guidance.
