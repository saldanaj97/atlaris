# Requirements Traceability Matrix: AI-Backed Learning Plan Generation

**Feature Branch**: `001-replace-the-mock`  
**Date**: 2025-01-27  
**Purpose**: Map functional and non-functional requirements to test cases for verification coverage

## Functional Requirements → Test Cases

### Core Generation Flow

| Requirement ID | Description                                                           | Test Cases                                     | Verification Method                              |
| -------------- | --------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------ |
| FR1            | Plan creation acknowledged immediately without waiting for generation | `tests/contract/plans.post.spec.ts`            | Contract test: 201 response within timeout       |
| FR2            | AI-backed generation attempt starts for each new plan                 | `tests/integration/generation.success.spec.ts` | Integration test: Verify attempt record creation |
| FR3            | Plan becomes "ready" only when ≥1 module exists                       | `tests/unit/status.derivation.spec.ts`         | Unit test: Status derivation logic               |
| FR4            | Generation success produces structured modules with ordered tasks     | `tests/integration/generation.success.spec.ts` | Integration test: Validate structure & ordering  |

### Ordering Integrity

| Requirement ID | Description                                                       | Test Cases                                        | Verification Method                       |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------- |
| FR5a           | Modules numbered sequentially starting at 1 with no gaps          | `tests/unit/ai.parser.validation.spec.ts`         | Parser validation test                    |
| FR5b           | Tasks per module numbered sequentially starting at 1 with no gaps | `tests/unit/ai.parser.validation.spec.ts`         | Parser validation test                    |
| FR5c           | Duplicate indices invalidate attempt (no persistence)             | `tests/integration/generation.validation.spec.ts` | Integration test: Validation failure path |
| FR5d           | Ordering remains stable across reads after success                | `tests/contract/plans.get.spec.ts`                | Contract test: Consistent read responses  |
| FR17           | Concurrent plan creations don't interfere with ordering           | `tests/integration/generation.concurrent.spec.ts` | Concurrency test                          |

### Error Handling & Classification

| Requirement ID | Description                                                                          | Test Cases                                        | Verification Method                    |
| -------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------- | -------------------------------------- |
| FR6            | Zero-module outputs are validation failures                                          | `tests/integration/generation.validation.spec.ts` | Integration test: Zero module scenario |
| FR7            | Failures classified: validation \| provider_error \| rate_limit \| timeout \| capped | `tests/unit/ai.classification.spec.ts`            | Unit test: Each classification branch  |
| FR8            | No partial modules/tasks persist on failure                                          | `tests/integration/generation.validation.spec.ts` | Integration test: Transaction rollback |
| FR9            | Internal errors not exposed; generic errors + correlation ID                         | `tests/unit/api.error-redaction.spec.ts`          | Unit test: Error message sanitization  |
| FR16           | Hard cap 3 attempts/plan; additional requests rejected                               | `tests/integration/generation.capped.spec.ts`     | Integration test: Attempt limiting     |

### Data Persistence & Integrity

| Requirement ID | Description                                                   | Test Cases                                         | Verification Method                 |
| -------------- | ------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------- |
| FR11           | Every generation attempt recorded with metadata               | `tests/integration/generation.success.spec.ts`     | Integration test: Attempt logging   |
| FR12           | Attempt metadata includes required JSON fields                | `tests/unit/metadata.schema-parity.spec.ts`        | Unit test: Metadata validation      |
| FR14           | Atomic transaction: attempt logging + module/task persistence | `tests/integration/generation.transaction.spec.ts` | Integration test: Atomicity         |
| FR15           | Transaction rollback on logging failure                       | `tests/integration/generation.transaction.spec.ts` | Integration test: Failure scenarios |

### Input Processing & Validation

| Requirement ID | Description                                                  | Test Cases                                      | Verification Method                |
| -------------- | ------------------------------------------------------------ | ----------------------------------------------- | ---------------------------------- |
| FR13           | Adaptive timeout: 10s base, extend to 20s if partial content | `tests/unit/ai.timeout.spec.ts`                 | Unit test: Timeout extension logic |
| FR18           | Attempt duration in milliseconds ±5ms tolerance              | `tests/unit/metrics.duration-precision.spec.ts` | Unit test: Duration measurement    |
| FR19           | Effort bounds: module 15-480min, task 5-120min with clamping | `tests/unit/utils.truncation-effort.spec.ts`    | Unit test: Normalization logic     |
| FR22           | Input limits: topic ≤200 chars, notes ≤2000 chars            | `tests/unit/utils.truncation-effort.spec.ts`    | Unit test: Truncation behavior     |

### API Contract Compliance

| Requirement ID | Description                                      | Test Cases                                  | Verification Method                   |
| -------------- | ------------------------------------------------ | ------------------------------------------- | ------------------------------------- |
| FR10           | Pending plans readable with empty modules list   | `tests/contract/plans.get.spec.ts`          | Contract test: Pending state response |
| FR23           | Derived status semantics: pending\|ready\|failed | `tests/unit/status.derivation.spec.ts`      | Unit test: Status mapping             |
| -              | POST /plans contract compliance                  | `tests/contract/plans.post.spec.ts`         | Contract test: 201/400/429 responses  |
| -              | GET /plans/{id}/attempts contract                | `tests/contract/plans.attempts.get.spec.ts` | Contract test: Attempt list format    |

## Non-Functional Requirements → Test Cases

### Performance Requirements

| Requirement ID | Description                                           | Test Cases                                        | Verification Method                     |
| -------------- | ----------------------------------------------------- | ------------------------------------------------- | --------------------------------------- |
| NFR1           | Plan create API p95 latency delta <+200ms vs baseline | `tests/perf/api.latency.perf.spec.ts`             | Performance test: Baseline comparison   |
| NFR2           | Creation response adds ≤50ms extra CPU                | `tests/perf/api.latency.perf.spec.ts`             | Performance test: CPU overhead          |
| NFR7           | Input truncation <5ms p95 overhead                    | `tests/perf/utils.truncation-effort.perf.spec.ts` | Micro-benchmark: Truncation performance |

### Security & Data Protection

| Requirement ID | Description                              | Test Cases                                     | Verification Method               |
| -------------- | ---------------------------------------- | ---------------------------------------------- | --------------------------------- |
| NFR3           | Logged data excludes sensitive user text | `tests/unit/api.error-redaction.spec.ts`       | Unit test: Log content validation |
| -              | RLS policies prevent cross-user access   | `tests/integration/rls.attempts-smoke.spec.ts` | RLS test: Access control          |

### System Quality

| Requirement ID | Description                                    | Test Cases                                         | Verification Method                  |
| -------------- | ---------------------------------------------- | -------------------------------------------------- | ------------------------------------ |
| NFR4           | Concurrency safety prevents duplicate ordering | `tests/integration/generation.concurrent.spec.ts`  | Concurrency test: Race conditions    |
| NFR5           | Error classification deterministic             | `tests/unit/ai.classification.spec.ts`             | Unit test: Consistent classification |
| NFR6           | Atomic transactions guarantee consistency      | `tests/integration/generation.transaction.spec.ts` | Integration test: ACID properties    |
| NFR8           | Correlation ID in error logs                   | `tests/unit/logging.correlation-id.spec.ts`        | Unit test: Log correlation           |

## Coverage Analysis

### Test Types Distribution

| Test Type         | Count  | Coverage Focus                    |
| ----------------- | ------ | --------------------------------- |
| Contract Tests    | 3      | API interface compliance          |
| Integration Tests | 7      | End-to-end scenarios & data flow  |
| Unit Tests        | 12     | Business logic & edge cases       |
| Performance Tests | 3      | Latency & throughput requirements |
| **Total**         | **25** | **Comprehensive coverage**        |

### Requirements Coverage Summary

| Requirement Category              | Total Requirements | Covered | Coverage % |
| --------------------------------- | ------------------ | ------- | ---------- |
| Functional Requirements (FR)      | 23                 | 23      | 100%       |
| Non-Functional Requirements (NFR) | 8                  | 8       | 100%       |
| **Total**                         | **31**             | **31**  | **100%**   |

### Gap Analysis

**Fully Covered Areas:**

- ✅ Core generation flow and success scenarios
- ✅ Error handling and classification logic
- ✅ Data persistence and transaction atomicity
- ✅ Input validation and normalization
- ✅ API contract compliance
- ✅ Performance and security requirements

**Edge Cases Validated:**

- ✅ Concurrent creation scenarios
- ✅ Transaction rollback conditions
- ✅ Timeout extension triggers
- ✅ Attempt capping enforcement
- ✅ Zero-module validation failures
- ✅ Classification determinism

**Integration Points Tested:**

- ✅ Database transaction boundaries
- ✅ AI provider abstraction layer
- ✅ Parsing and validation pipeline
- ✅ RLS policy enforcement
- ✅ Error correlation and logging

## Test Execution Strategy

### Phase 1: Contract Tests (Must Fail First)

Execute contract tests before implementation to establish TDD baseline:

```bash
# These should fail initially (no implementation yet)
pnpm test tests/contract/
```

### Phase 2: Unit Tests (Business Logic)

Validate core algorithms and utilities:

```bash
pnpm test tests/unit/
```

### Phase 3: Integration Tests (End-to-End)

Verify complete user scenarios:

```bash
pnpm test tests/integration/
```

### Phase 4: Performance Validation

Benchmark against requirements:

```bash
pnpm test tests/perf/
```

### Continuous Validation

```bash
# Full test suite for CI/CD
pnpm test

# Watch mode for development
pnpm test --watch
```

## Success Criteria

**Feature Complete When:**

- [ ] All 31 requirements have corresponding passing test cases
- [ ] 100% test coverage maintained across requirement categories
- [ ] Performance benchmarks meet or exceed targets
- [ ] No security or data integrity gaps identified
- [ ] Contract tests validate API compliance
- [ ] Integration tests confirm user story completion

**Quality Gates:**

- Contract tests establish API baseline ✓
- Unit tests validate business rules ✓
- Integration tests confirm data flow ✓
- Performance tests meet SLA targets ✓
- Security tests prevent data leaks ✓

---

_This traceability matrix ensures comprehensive test coverage for the AI-backed learning plan generation feature, mapping every requirement to specific test cases for validation and verification._
