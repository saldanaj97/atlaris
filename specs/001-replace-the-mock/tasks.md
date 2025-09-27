# Tasks: AI‑Backed Learning Plan Generation (Replace Mock)

**Feature Directory**: `/Users/juansaldana/Projects/learning-path-app/specs/001-replace-the-mock`
**Branch**: `001-replace-the-mock`
**Input Docs**: plan.md, research.md, data-model.md, quickstart.md, contracts/openapi.yaml, spec.md

Legend:

P = Parallelizable (different files, no direct dependency)
T = Test task (must fail first if pre-implementation)
M = Migration/schema change
D = Documentation
Perf = Performance / observability

Ordering Principles Applied:

1. Setup & migrations first
2. Contract & integration tests before implementation (TDD)
3. Models → services → endpoints → mappers
4. Integration & RLS after core schema
5. Performance & polish last

## Phase 3.1: Setup & Preconditions

- [X] T001 Verify design artifacts present (plan.md, research.md, data-model.md, quickstart.md, contracts/openapi.yaml, spec.md) (D) in `/Users/juansaldana/Projects/learning-path-app/specs/001-replace-the-mock/`
- [ ] T002 Ensure branch rebased on latest `main` (no conflicts)
- [X] T003 Configure test runner (Vitest) and add base config `vitest.config.ts` + script in `package.json`
- [X] T004 [P] Add testing folders: `tests/contract`, `tests/integration`, `tests/unit`

## Phase 3.2: Schema & Migration (Blocking for downstream)

- [ ] T005 Create Drizzle table model `generationAttempts` in `src/lib/db/schema.ts` (nullable classification, boolean flags) (M)
- [ ] T006 Generate SQL migration file in `src/lib/db/migrations/` adding table + indexes + CHECK constraint `classification_null_on_success` (M)
- [ ] T007 Apply migration (local) and verify via `psql` or Drizzle introspection (M)
- [ ] T008 Add RLS policies SQL (select own, insert own) under `supabase/tests/database/` new file `015-rls-generation_attempts.sql` (M)
- [ ] T009 Update seed script `src/lib/db/seed.ts` to ignore new table or add sample attempt optional

## Phase 3.3: Contract & Integration Tests (Write FIRST – must fail) ⚠️

- [ ] T010 (T) Contract test POST /plans (201, 400 validation, 429 capped) `tests/contract/plans.post.spec.ts`
- [ ] T011 (T) Contract test GET /plans/{id} (200 detail shape) `tests/contract/plans.get.spec.ts`
- [ ] T012 (T) Contract test GET /plans/{id}/attempts (200 list, 404 not owned) `tests/contract/plans.attempts.get.spec.ts`
- [ ] T013 (T) Integration test: successful generation scenario → pending then ready `tests/integration/generation.success.spec.ts`
- [ ] T014 (T) Integration test: timeout classification path `tests/integration/generation.timeout.spec.ts`
- [ ] T015 (T) Integration test: validation failure (zero modules) `tests/integration/generation.validation.spec.ts`
- [ ] T016 (T) Integration test: rate_limit classification (mock provider) `tests/integration/generation.rate_limit.spec.ts`
- [ ] T017 (T) Integration test: capped after 3 attempts `tests/integration/generation.capped.spec.ts`

## Phase 3.4: Domain Types & Utilities

- [ ] T018 [P] Define domain enums & types (PlanStatus, FailureClassification, GenerationAttempt) in `src/lib/types/client.ts`
- [ ] T019 [P] Add Zod schema refinements for truncation bounds (topic ≤200, notes ≤2000) in `src/lib/validation/learningPlans.ts`
- [ ] T020 [P] Implement truncation util `src/lib/utils/truncation.ts` returning { value, truncated, originalLength }
- [ ] T021 [P] Implement effort normalization util `src/lib/utils/effort.ts` (clamp + aggregated flags)
- [ ] T022 (T) Unit tests truncation & normalization `tests/unit/utils.truncation-effort.spec.ts`

## Phase 3.5: AI Provider Abstraction

- [ ] T023 [P] Create provider interface `src/lib/ai/provider.ts` (stream or single JSON)
- [ ] T024 [P] Implement mock provider `src/lib/ai/mockProvider.ts` deterministic JSON
- [ ] T025 [P] Skeleton real provider adapter `src/lib/ai/openaiProvider.ts` (no secrets committed)
- [ ] T026 (T) Unit test mock provider deterministic output `tests/unit/ai.mockProvider.spec.ts`

## Phase 3.6: Streaming Parser & Adaptive Timeout

- [ ] T027 [P] Implement incremental parser `src/lib/ai/parser.ts` (partial module detection)
- [ ] T028 [P] Implement adaptive timeout controller `src/lib/ai/timeout.ts` (10s base, extend to 20s if module before 9.5s)
- [ ] T029 [P] Integrate parser + timeout into orchestrator `src/lib/ai/orchestrator.ts`
- [ ] T030 (T) Unit test timeout extension trigger logic `tests/unit/ai.timeout.spec.ts`
- [ ] T031 (T) Unit test invalid JSON / zero modules classification path `tests/unit/ai.parser.validation.spec.ts`

## Phase 3.7: Classification Module

- [ ] T032 [P] Implement classification mapping `src/lib/ai/classification.ts`
- [ ] T033 (T) Unit tests each classification branch `tests/unit/ai.classification.spec.ts`

## Phase 3.8: Attempt Service & Transaction

- [ ] T034 Implement attempt service `src/lib/db/queries/attempts.ts` (startAttempt, recordSuccess, recordFailure)
- [ ] T035 Integrate truncation + normalization + prompt hash (sha256 util `src/lib/utils/hash.ts`)
- [ ] T036 Implement success path transaction (insert modules/tasks + attempt) in `src/lib/db/queries/attempts.ts`
- [ ] T037 Implement failure path (attempt only) ensuring atomic semantics
- [ ] T038 (T) Unit test success counts & flags `tests/unit/attempts.success.spec.ts`
- [ ] T039 (T) Unit test validation failure attempt `tests/unit/attempts.validation.spec.ts`
- [ ] T040 (T) Unit test timeout failure attempt `tests/unit/attempts.timeout.spec.ts`
- [ ] T041 (T) Unit test capped attempt (no provider invocation) `tests/unit/attempts.capped.spec.ts`

## Phase 3.9: Attempt Cap Enforcement

- [ ] T042 [P] Add cap check (max 3) in service before provider call `src/lib/db/queries/attempts.ts`
- [ ] T043 [P] Return standardized 429 error via `src/lib/api/errors.ts`
- [ ] T044 (T) Unit/integration test cap boundaries `tests/integration/generation.cap-boundary.spec.ts`

## Phase 3.10: API Layer Updates

- [ ] T045 Update POST `/api/v1/plans` handler `src/app/api/v1/plans/route.ts` to fire async generation (fire-and-forget)
- [ ] T046 Add GET plan detail endpoint (if separate) or extend existing `[planId]/route.ts` to include status + latest attempt
- [ ] T047 Create attempts list endpoint `src/app/api/v1/plans/[planId]/attempts/route.ts`
- [ ] T048 Standardize error responses (validation, capped, rate_limit) in `src/lib/api/response.ts`
- [ ] T049 (T) Contract tests updated endpoints pass (re-run T010–T012 now expected to move from failing → passing)

## Phase 3.11: Query & Mapper Extensions

- [ ] T050 Extend plan detail query `src/lib/db/queries/planQueries.ts` to fetch latest attempt + modules/tasks
- [ ] T051 Implement attempts listing query `src/lib/db/queries/planQueries.ts` (or new file `generationAttemptsQueries.ts`)
- [ ] T052 Add mapper for DB → client DTO (null classification on success) `src/lib/mappers/detailToClient.ts`
- [ ] T053 (T) Unit tests mapper correctness `tests/unit/mappers.detailToClient.spec.ts`

## Phase 3.12: RLS & Security Tests

- [ ] T054 (T) Attempt visibility: owner can list attempts; others denied `tests/integration/rls.attempts-visibility.spec.ts`
- [ ] T055 (T) Ensure attempts insertion blocked when not owner (simulate) `tests/integration/rls.attempts-insert.spec.ts`

## Phase 3.13: Concurrency & Integrity

- [ ] T056 (T) Simultaneous plan creations ordering integrity `tests/integration/concurrency.plan-ordering.spec.ts`
- [ ] T057 (T) Simulated provider stall triggers timeout classification `tests/integration/concurrency.timeout-stall.spec.ts`
- [ ] T058 (T) Inject DB error → rollback (no partial modules/tasks) `tests/integration/concurrency.rollback.spec.ts`

## Phase 3.14: Observability & Metrics

- [ ] T059 [P] Capture duration_ms & counts instrumentation in attempt service (Perf)
- [ ] T060 [P] Optional in-memory metrics export module `src/lib/metrics/attempts.ts` (Perf)
- [ ] T061 (T) Test duration_ms > 0 for success attempt `tests/unit/metrics.duration.spec.ts`

## Phase 3.15: Performance Harness

- [ ] T062 Create performance script `scripts/perf/measure-generation.ts` (baseline vs generation path) (Perf)
- [ ] T063 Run baseline vs feature p95 (<+200ms) documentation `docs/performance/ai-generation.md` (Perf)
- [ ] T064 Measure timeout vs extended timeout cases (10s vs ~20s) add to doc (Perf)

## Phase 3.16: Documentation & Polish

- [ ] T065 (D) Update `quickstart.md` with final response payloads (classification null on success)
- [ ] T066 (D) README feature summary section update
- [ ] T067 (D) Add performance appendix / results to plan.md deferred section
- [ ] T068 (D) Trace FR/NFR → test cases table `docs/traceability/ai-generation.md`

## Phase 3.17: Final Validation

- [ ] T069 (T) Full test suite run (unit + integration + contract) green
- [ ] T070 (T) Manual quickstart walkthrough (create → poll → attempts list)
- [ ] T071 (D) Prepare release notes / changelog entry
- [ ] T072 (D) Post-implementation review of deferred items (retention, redaction)

## Phase 3.18: Post-MVP (Not in Scope Implementation)

- [ ] T073 (D) Draft idempotency key proposal `docs/proposals/idempotency.md`
- [ ] T074 (D) Draft retention policy `docs/proposals/attempt-retention.md`
- [ ] T075 (D) Provider failover strategy outline `docs/proposals/provider-failover.md`

## Phase 3.19: Remediation & Alignment Additions

Rationale: Added to address clarified spec items (derived status, correlation ID, performance baseline, metadata schema parity, classification completeness) and constitutional alignment (early RLS, observability lite) after post-spec remediation.

- [ ] T076 (Perf) Capture pre-implementation baseline latency for POST /plans (before heavy logic) store results in temporary `docs/performance/baseline.md`
- [ ] T077 (Perf) Micro-benchmark truncation & normalization utils (<5ms p95) `tests/perf/utils.truncation-effort.perf.spec.ts`
- [ ] T078 (T) Precision test attempt duration_ms tolerance (non-zero, within plausible bounds >0 & <25_000) `tests/unit/metrics.duration-precision.spec.ts`
- [ ] T079 (T) Derived status test matrix (pending→ready, pending→failed, capped still failed after third) `tests/unit/status.derivation.spec.ts`
- [ ] T080 (T) Early RLS smoke: ensure new generation_attempts table policies deny cross-user select immediately after migration (can run after T008) `tests/integration/rls.attempts-smoke.spec.ts`
- [ ] T081 (T) Error redaction & standardization test (ensure internal provider errors not leaked) `tests/unit/api.error-redaction.spec.ts`
- [ ] T082 (D) Document metadata schema parity & flags rationale `docs/metadata/attempt-metadata.md`
- [ ] T083 (D) Classification matrix (input condition → classification) `docs/classification/matrix.md`
- [ ] T084 Implement correlation ID propagation (middleware adds id, logged in attempt service) `src/middleware.ts` + `src/lib/api/context.ts`
- [ ] T085 (T) Correlation ID logging test (inject fake logger, assert id presence) `tests/unit/logging.correlation-id.spec.ts`
- [ ] T086 (D) Provider cost & fallback considerations doc `docs/providers/cost-and-fallback.md`

---

## Dependencies Overview

T005→T006→T007 block all service/endpoint work (T034+). Tests T010–T017 must exist & fail before implementing corresponding logic (T027–T037, T045+). Cap enforcement (T042–T044) depends on attempt service foundations (T034–T037). API updates (T045–T048) depend on parser + classification + attempt service (T027–T037, T032–T033). Mappers (T050–T053) depend on schema & attempt service.

Remediation tasks:

- T076 should execute before implementing heavy generation logic to preserve a true baseline.
- T080 can run immediately after RLS policies (T008) even before broader implementation (early security validation).
- T084 depends on existing middleware presence; tests (T085) follow instrumentation.
- T079, T081 depend on attempt service + classification module being in place.

## Parallel Execution Examples

Example 1 (after T007 complete):
Run in parallel: T018, T019, T020, T021 (distinct new files)
Example 2 (after T023–T029 ready for tests):
Run in parallel: T032, T042, T050 (classification, cap logic, query extension touch different files)

Example Task Agent Commands (conceptual):
/run-task T018 | /run-task T019 | /run-task T020 | /run-task T021
/run-task T032 | /run-task T042 | /run-task T050

## Validation Checklist

- [ ] Every OpenAPI path (POST /plans, GET /plans/{id}, GET /plans/{id}/attempts) has contract test (T010–T012)
- [ ] Each user story → integration test (success, timeout, validation, rate_limit, capped) (T013–T017)
- [ ] Data model entity (generation_attempts) has migration & RLS tasks (T005–T009 + early smoke T080)
- [ ] Tests precede implementation modules
- [ ] Derived status covered (T079)
- [ ] Correlation ID logged (T084–T085)
- [ ] Performance baseline + micro-benchmark captured (T076–T077)
- [ ] Metadata schema documented (T082) & classification matrix (T083)
- [ ] Error redaction verified (T081)
- [ ] Parallelizable tasks do not share files
- [ ] All tasks reference absolute or project-root-relative paths

## Exit Criteria

All tasks T001–T072 completed plus remediation T076–T086; performance doc shows p95 overhead < +200ms; micro benchmarks pass (<5ms truncation/normalization); status derivation tests green; traceability matrix (T068) present; deferred items documented (T073–T075 not required for feature completion).
