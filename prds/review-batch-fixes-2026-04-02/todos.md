# Review Batch Fixes 2026-04-02

## Scope

- [x] Workstream 1: Fix verified accessibility and Playwright smoke findings.
- [x] Workstream 2: Fix verified PDF fixture and pricing unit-test findings.
- [x] Workstream 3: Fix verified smoke script unit-test boundary findings.

## Workstream 1

- [x] Re-verify the `PdfPlanSettingsEditor` heading/label finding against the current JSX.
- [x] Replace static smoke plan input usage with a factory where needed.
- [x] Harden smoke plan-generation waits and split overloaded smoke tests into focused cases.

## Workstream 2

- [x] Harden PDF fixture string escaping and page-count handling.
- [x] Expand pricing page unit coverage for billing-portal eligibility, subscription states, Stripe args, and logger behavior.

## Workstream 3

- [x] Rename misleading smoke mode-config tests and split ambiguous cases.
- [x] Remove real filesystem I/O from smoke state-file unit tests via dependency injection and in-memory fakes.
- [x] Extract reusable incomplete smoke-state test data.

## Review

- [x] Run targeted verification for touched suites.
- [x] Update this file with completion state and review notes.

## Review Notes

- Verified the pricing-page review comments against current behavior instead of forcing stale assumptions into tests. The page currently renders only the active monthly `PricingGrid` server-side, and billing-portal eligibility is any truthy `stripeCustomerId` plus any non-null `subscriptionStatus`, including `trialing`, `canceled`, and `past_due`.
- `PdfPlanSettingsEditor` now exposes a real section heading via `aria-labelledby`, so smoke selectors were updated to target the region by its semantic name instead of the redundant `"PDF plan settings"` label.
- `waitForGeneratedModules` no longer burns time in a manual `Date.now()` loop. It now uses Playwright retry semantics, preserves the reload path for the server-driven empty state, and fails fast when an error alert appears.
- `tests/helpers/smoke/state-file.ts` now supports dependency injection for filesystem operations while preserving the existing default Node behavior at runtime; unit tests use an in-memory fake FS instead of touching the real filesystem.
- Verification run: `pnpm test:changed`
- Static checks run: `pnpm exec biome check src/app/plans/new/components/PdfPlanSettingsEditor.tsx tests/playwright/smoke/fixtures.ts tests/playwright/smoke/auth.launch-blockers.spec.ts tests/playwright/smoke/auth.pdf-settings.spec.ts tests/playwright/smoke/helpers/pdf-fixture.ts tests/helpers/smoke/state-file.ts tests/unit/helpers/smoke/mode-config.spec.ts tests/unit/helpers/smoke/state-file.spec.ts tests/unit/app/pricing/page.spec.tsx tests/fixtures/smoke-state.ts prds/review-batch-fixes-2026-04-02/todos.md prds/review-batch-fixes-2026-04-02/plan.md`
