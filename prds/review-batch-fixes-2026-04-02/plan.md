# Plan

## Step 1.0 - Confirm findings and ownership

1. Re-check each requested finding against the current tree before editing.
2. Keep production code, smoke helpers, and their tests aligned in the same change set.
3. Avoid touching findings that are already satisfied.

## Step 1.1 - Accessibility and Playwright smoke fixes

1. Replace the visual paragraph heading in `src/app/plans/new/components/PdfPlanSettingsEditor.tsx` with a semantic heading and `aria-labelledby`.
2. Refactor Playwright smoke fixtures to expose `createPlanInput(overrides?)` and to use Playwright-native waiting instead of the manual polling loop.
3. Tighten smoke specs by:
   - aligning timeout intent,
   - asserting generated modules exist before navigating,
   - adding a response timeout for preferences saves, and
   - splitting multi-purpose settings coverage into focused tests.

## Step 1.2 - PDF helper and pricing unit fixes

1. Harden `tests/playwright/smoke/helpers/pdf-fixture.ts` for newline escaping and invalid page counts.
2. Expand `tests/unit/app/pricing/page.spec.tsx` to verify:
   - billing portal gating for missing Stripe customers,
   - multiple subscription-status branches,
   - Stripe pricing-grid props/call args, and
   - logger behavior for incomplete Stripe data.

## Step 1.3 - Smoke script unit-test cleanup

1. Rename misleading mode-config test descriptions and split ambiguous mode parsing coverage.
2. Add optional filesystem dependency injection to `tests/helpers/smoke/state-file.ts` with default Node fs behavior.
3. Rewrite `tests/unit/helpers/smoke/state-file.spec.ts` to use an in-memory fake FS and shared incomplete-payload factory.

## Validation Steps

1. Run `pnpm test:changed`.
2. Run targeted Vitest/Playwright-related suites if failures need isolation.

## Issue Verification and Closure

1. Walk the original finding list and confirm each item is fixed or already satisfied.
2. Record any deviations or residual risks in `todos.md`.
