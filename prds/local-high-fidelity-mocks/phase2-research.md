# Phase 2: AI and Upload Safety — Research

> **Parent PRD:** `prds/local-high-fidelity-mocks/prd.md`
> **Research date:** 2026-03-30
> **Scope:** Extend local product testing without weakening real security boundaries

---

## Slice 4: AI Runtime Mock Hardening

### Current State

AI is already the healthiest local story in the repo:

- development already defaults to the runtime mock provider;
- the mock provider already streams through the real orchestration path;
- local AI flows already create real app-side writes and realistic streaming behavior.

The missing part is scenario control. Today the runtime mock mostly offers generic success plus failure-rate randomness. The richer explicit scenarios exist mainly in tests, not in runtime local development.

### Recommended Direction

- Extend the existing runtime mock provider rather than inventing another mock architecture.
- Add named local scenarios for success, timeout, provider error, malformed output, and rate limiting.
- Keep deterministic control and route/orchestrator reuse.
- Improve usage/provider metadata enough for product-facing smoke checks.

### Files Likely To Change

- `src/features/ai/providers/mock.ts`
- `src/features/ai/providers/factory.ts`
- `src/lib/config/env.ts`
- `.env.example`
- Tests:
  - `tests/unit/ai/provider-factory.spec.ts`
  - AI mock-provider unit tests
  - `tests/integration/api/plans-stream.spec.ts`

### Implementation Steps

1. Define runtime scenario selection and env surface.
2. Add deterministic scenario injection.
3. Improve usage/provider metadata and failure modes.
4. Verify the real stream/orchestrator route still behaves correctly.

### Risks

- If runtime behavior stays much simpler than test helpers, local AI confidence will stay artificially high.
- If scenario selection requires code edits, it will not be useful for product testing.

---

## Slice 5: AV Mock Provider Improvements

### Current State

AV is already safe locally, but not high-fidelity:

- heuristic scanning always runs first;
- `AV_PROVIDER=none` gives heuristic-only behavior and is correctly rejected in production;
- the extraction flow already fails closed on malware or scan failure.

The gap is that richer provider scenarios are only reachable in tests or with real MetaDefender.

### Recommended Direction

- Keep `AV_PROVIDER=none` meaning heuristic-only mode.
- Add a separate mock provider branch for local product testing.
- Support clean, infected, timeout, and malformed-provider responses.
- Preserve the existing fail-closed extraction behavior and log signals.

### Files Likely To Change

- `src/features/pdf/security/scanner-factory.ts`
- `src/features/pdf/security/malware-scanner.ts`
- `src/lib/config/env.ts`
- `.env.example`
- Tests:
  - scanner-factory unit tests
  - malware-scanner unit tests
  - PDF extract integration tests

### Implementation Steps

1. Add a mock AV provider implementation and selection path.
2. Keep heuristic-only mode untouched.
3. Add explicit scenario control for provider outcomes.
4. Verify extraction still blocks on malware or scan failure.

### Risks

- Overloading `none` to mean both heuristic-only and mock-provider mode would blur the safety model.
- If the mock provider bypasses the existing scanner orchestration, local results will not match app behavior.

---

## Validation Commands

- `./scripts/test-integration.sh tests/integration/api/plans-stream.spec.ts`
- `./scripts/test-integration.sh tests/integration/pdf-extract.spec.ts`
- targeted unit tests for AI provider factory/mock and AV scanner factory/malware scanner
- `pnpm test:changed`

## Manual Validation

1. Trigger AI success and failure scenarios through the real stream route.
2. Upload PDFs and verify clean, infected, timeout, and malformed-provider outcomes locally.
