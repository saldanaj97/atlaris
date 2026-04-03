# Phase 3: Expanded Local Flows and Finalization — Research & Implementation Plans

> **Parent PRD:** [plan.md](/Users/juansaldana/Dev/Projects/atlaris/prds/playwright-local-smoke/plan.md)
> **Execution tracker:** [todos.md](/Users/juansaldana/Dev/Projects/atlaris/prds/playwright-local-smoke/todos.md)
> **Prerequisite:** [phase2-research.md](/Users/juansaldana/Dev/Projects/atlaris/prds/playwright-local-smoke/phase2-research.md)
> **Research date:** 2026-04-02
> **Status:** Research synced with implementation contract on 2026-04-02

---

## Slice 5: Remaining Local Flows, Docs, and Final Hardening

### 1. Current State

The remaining scope splits into three different kinds of work: PDF browser smoke, settings browser smoke, and documentation/tooling cleanup.

PDF flow current state:

- [src/app/api/v1/plans/from-pdf/extract/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/from-pdf/extract/route.ts#L156) already performs the real PDF browser-backend work: streamed size check, per-user and global extraction throttles, malware scan, page-count validation, extraction, and proof issuance.
- [src/app/plans/new/components/PdfCreatePanel.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/PdfCreatePanel.tsx#L230) already drives the browser flow: upload, preview, generate, retry/back handling, and navigation.
- [src/app/plans/new/components/PdfUploadZone.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/PdfUploadZone.tsx#L158) exposes an accessible upload button with a hidden file input; this is browser-automation friendly.
- [tests/integration/pdf-extract.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/integration/pdf-extract.spec.ts#L81) already covers server-side PDF extract behavior deeply.
- [tests/e2e/pdf-to-plan.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/e2e/pdf-to-plan.spec.ts#L105) covers app-level PDF logic under Vitest/jsdom, including a useful inline minimal PDF builder at [tests/e2e/pdf-to-plan.spec.ts:13]( /Users/juansaldana/Dev/Projects/atlaris/tests/e2e/pdf-to-plan.spec.ts#L13 ).
- [src/app/plans/new/components/usePdfExtractionDraft.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/usePdfExtractionDraft.ts#L39) defaults PDF settings `deadlineWeeks` to `'4'`, which has the same free-tier cap problem as manual creation.
- [src/features/pdf/security/scanner-factory.ts](/Users/juansaldana/Dev/Projects/atlaris/src/features/pdf/security/scanner-factory.ts#L24) and [src/features/pdf/security/malware-scanner.ts](/Users/juansaldana/Dev/Projects/atlaris/src/features/pdf/security/malware-scanner.ts#L107) show that AV behavior is configurable and cached; deterministic smoke should own it explicitly through launcher env.

Settings current state:

- Profile settings are real persistence:
  - [src/app/settings/profile/components/ProfileForm.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/settings/profile/components/ProfileForm.tsx#L225) fetches `/api/v1/user/profile`
  - [src/app/settings/profile/components/ProfileForm.tsx:245]( /Users/juansaldana/Dev/Projects/atlaris/src/app/settings/profile/components/ProfileForm.tsx#L245 ) saves profile name via `PUT /api/v1/user/profile`
  - [src/app/api/v1/user/profile/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/user/profile/route.ts#L44) applies the persisted update
- AI settings are real persistence:
  - [src/app/settings/ai/components/ModelSelectionCard.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/settings/ai/components/ModelSelectionCard.tsx#L24) renders the selector based on the current user row
  - [src/app/settings/ai/components/ModelPreferencesSelector.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/settings/ai/components/ModelPreferencesSelector.tsx#L29) patches `/api/v1/user/preferences`
  - [src/app/api/v1/user/preferences/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/user/preferences/route.ts#L76) persists `preferredAiModel`
  - [src/features/ai/model-preferences.ts](/Users/juansaldana/Dev/Projects/atlaris/src/features/ai/model-preferences.ts#L39) filters settings-visible models to persistable values only
- Integrations and notifications are render-only:
  - [src/app/settings/integrations/page.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/settings/integrations/page.tsx#L14) renders static integration cards/request UI
  - [src/app/settings/notifications/page.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/settings/notifications/page.tsx#L32) renders disabled placeholder toggles only

Documentation/tooling current state:

- [docs/testing/browser-smoke-testing.md](/Users/juansaldana/Dev/Projects/atlaris/docs/testing/browser-smoke-testing.md#L1) is still the stale manual/MCP-oriented document and should be downgraded to a historical reference.
- [tests/AGENTS.md](/Users/juansaldana/Dev/Projects/atlaris/tests/AGENTS.md#L45) and [docs/testing/test-standards.md](/Users/juansaldana/Dev/Projects/atlaris/docs/testing/test-standards.md#L251) already recognize Playwright smoke ownership after Phase 2, so Phase 3 should only add a canonical doc cross-link instead of reopening their policy.
- [docs/testing/smoke-test-results-2026-04-01.md](/Users/juansaldana/Dev/Projects/atlaris/docs/testing/smoke-test-results-2026-04-01.md#L95) still records the unresolved plans-page accessibility warning.
- The current local Playwright config now runs with `workers: 1`; source-of-truth docs must reflect that the suite is intentionally serial for local stability even though anon and auth mode ownership remain separate.

Important gaps and traps:

- PDF browser smoke will fail if it relies on the default `1 month` deadline while the seeded auth user is still free tier.
- Profile and AI settings have real persistence; integrations and notifications do not. Treating them all as “save flows” would be fake coverage.
- The old smoke docs will keep misleading future implementation unless they are explicitly replaced or updated as part of this phase.

### 2. Files to Change

| File | Change | Lines |
|------|--------|-------|
| [docs/testing/browser-smoke-testing.md](/Users/juansaldana/Dev/Projects/atlaris/docs/testing/browser-smoke-testing.md#L1) | Reduce to historical/manual reference and point current workflow to the canonical Playwright doc | 1-305 |
| [tests/AGENTS.md](/Users/juansaldana/Dev/Projects/atlaris/tests/AGENTS.md#L43) | Add a canonical Playwright smoke doc cross-link only if needed | 43-70 |
| [docs/testing/test-standards.md](/Users/juansaldana/Dev/Projects/atlaris/docs/testing/test-standards.md#L217) | Add a canonical Playwright smoke doc cross-link only if needed | 217-252 |
| [docs/testing/smoke-test-results-2026-04-01.md](/Users/juansaldana/Dev/Projects/atlaris/docs/testing/smoke-test-results-2026-04-01.md#L95) | Historical reference for defects to either fix or encode in automation | 95-118 |

**New files:**

| File | Purpose |
|------|---------|
| `tests/playwright/smoke/auth.pdf-settings.spec.ts` | PDF upload/generate and persistent settings browser smoke |
| `tests/playwright/smoke/helpers/pdf-fixture.ts` | Minimal valid PDF builder or fixture helper derived from existing e2e logic |
| `docs/testing/playwright-local-smoke.md` | Canonical repo-local instructions for the committed smoke workflow |

### 3. Implementation Steps (TDD)

1. **Add PDF helper coverage first:**
   - Extract or mirror the minimal valid PDF generator from [tests/e2e/pdf-to-plan.spec.ts](/Users/juansaldana/Dev/Projects/atlaris/tests/e2e/pdf-to-plan.spec.ts#L13) into a reusable smoke helper.
   - Add unit coverage if that helper has meaningful logic.

2. **Implement PDF browser smoke:**
   - Upload a valid generated PDF through the browser.
   - Wait for preview state, optionally edit fields, and submit generation.
   - Use free-tier-compatible settings unless the test intentionally depends on a paid state established earlier.
   - Add at least one validation-path assertion for an obviously invalid upload if it can be done cheaply without making the suite noisy.

3. **Implement settings browser smoke:**
   - Cover profile name save and refresh verification.
   - Cover AI preference save and refresh verification.
   - Cover integrations and notifications as load-only checks, not fake saves.

4. **Fix or pin the known `/plans` accessibility warning:**
   - If implementation adds the missing input attributes or selector hardening, extend [tests/unit/components/PlansList.spec.tsx](/Users/juansaldana/Dev/Projects/atlaris/tests/unit/components/PlansList.spec.tsx#L210) accordingly.
   - Keep the fix minimal; do not redesign the page for one warning.

5. **Update docs and verification artifacts last:**
   - Point future smoke work to Playwright and the new command surface.
   - Record verification commands and actual outcomes in the PRD tracker.

### 4. Risk Areas

- **Behavioral risk:** HIGH — PDF upload combines file input automation, AV scanning, extraction latency, and generation state transitions.
- **State-coupling risk:** MEDIUM — if PDF smoke quietly relies on a prior billing upgrade, failures will become order-dependent and harder to diagnose.
- **Machine-resource risk:** MEDIUM — project-level parallel execution looked attractive on paper, but local developer machines under load made it less trustworthy than a serial runner.
- **Docs drift risk:** HIGH — leaving old smoke docs uncorrected will guarantee future agents reintroduce the dead toolchain assumptions.
- **Selector risk:** LOW — existing accessible names are reasonably good, but minimal hardening may still be needed for the most brittle controls.

### 5. Estimated Overlap

- **With Phase 2 billing flow:** same seeded auth user and shared disposable DB; avoid hidden dependency on paid-state mutations.
- **With existing Vitest tests:** the PDF helper and any PlansList accessibility fix should reuse existing fixtures/tests rather than fork behavior.
- **Merge recommendation:** land browser PDF/settings coverage before docs cleanup only if the docs clearly say implementation is in progress. Otherwise update docs immediately after the tests land so the repo does not lie.

---

## Cross-Slice Analysis

### Recommended Implementation Order

```text
Phase 2 complete
  └── Slice 5a: PDF fixture/helper extraction
        ├── Slice 5b: PDF browser smoke
        ├── Slice 5c: Settings browser smoke
        ├── Slice 5d: PlansList accessibility hardening (if still needed)
        └── Slice 5e: Docs and verification artifact cleanup
```

**Rationale:** The PDF helper is the reusable piece. PDF and settings browser smoke can land independently once the core runner exists. Docs cleanup should happen immediately after test behavior is real, not weeks later when everyone has already memorized the wrong workflow again.

### Shared File Map

| File | Slice 5 |
|------|---------|
| [src/app/plans/new/components/PdfCreatePanel.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/new/components/PdfCreatePanel.tsx#L230) | ✅ browser PDF flow |
| [src/app/api/v1/plans/from-pdf/extract/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/plans/from-pdf/extract/route.ts#L156) | ✅ PDF backend contract |
| [src/app/settings/profile/components/ProfileForm.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/settings/profile/components/ProfileForm.tsx#L225) | ✅ profile persistence flow |
| [src/app/api/v1/user/preferences/route.ts](/Users/juansaldana/Dev/Projects/atlaris/src/app/api/v1/user/preferences/route.ts#L76) | ✅ AI preference persistence |
| [src/app/plans/components/PlansList.tsx](/Users/juansaldana/Dev/Projects/atlaris/src/app/plans/components/PlansList.tsx#L74) | ✅ possible accessibility fix |
| [docs/testing/browser-smoke-testing.md](/Users/juansaldana/Dev/Projects/atlaris/docs/testing/browser-smoke-testing.md#L1) | ✅ docs cleanup |
