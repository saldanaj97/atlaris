# [FEATURE TITLE HERE]

> **Outcome**: <Describe the end-to-end outcome for this feature.>

**Branch**: `feature/<feature-name>`

Legend:

P = Parallelizable (different files, no direct dependency)
T = Test task (must precede related feature work)
M = Migration/schema change
D = Documentation

**Numbering Guidance**: Use global sequential IDs (e.g., F001, F002, T001, T002) across all phases. Preserve ordering so tests (T-series) appear before the related feature (F-series) tasks.

---

## Phase 1: <Phase Title>

**Purpose:** <Describe why this phase exists and what it unlocks.>

**Exit Gate:** <List the conditions that must be satisfied before moving to the next phase.>

### Phase 1 Test Plan (T-Series)

- [ ] T001 <Test task description with exact file path and assertions>
- [ ] T002 <Add/remove rows as needed; keep numbering sequential>

### Phase 1 Feature Checklist (F-Series)

- [ ] F001 <Feature task description with exact file path>
- [ ] F002 [P] <Parallelizable feature task>

### Phase 1 Performance & Observability (Optional)

> Include only if this phase introduces monitoring, logging, or performance-specific tasks; remove section when not applicable.

- [ ] F010 <Optional performance/observability task>

### Phase 1 Details

**Implementation Notes:**

- <Detail any schema updates, service responsibilities, or architectural constraints.>

**Example Snippets / Contracts:**

```typescript
// Provide representative code or pseudo-code needed for implementation.
```

---

## Phase 2: <Phase Title>

**Purpose:** <Explain the goals and rationale for this phase.>

**Exit Gate:** <Document the required state before proceeding to Phase 3.>

### Phase 2 Test Plan (T-Series)

- [ ] T010 <Test coverage placeholder>
- [ ] T011 <Add more tests as needed>

### Phase 2 Feature Checklist (F-Series)

- [ ] F010 <Primary feature task>
- [ ] F011 [P] <Parallel feature task>

### Phase 2 Performance & Observability (Optional)

> Use this section only when Phase 2 introduces monitoring/performance work; otherwise remove it.

- [ ] F020 <Optional observability improvement>

### Phase 2 Details

**Provider / Service Notes:**

- <Call out external dependencies, configuration toggles, or abstractions introduced in this phase.>

**Sample Output / Interfaces:**

```json
{
  "sample": "Provide representative payloads or streaming chunk examples."
}
```

---

## Phase 3: <Phase Title>

**Purpose:** <Highlight the primary objective of Phase 3.>

**Exit Gate:** <Define the validation needed before Phase 4 work begins.>

### Phase 3 Test Plan (T-Series)

- [ ] T020 <Worker/unit/contract test placeholder>
- [ ] T021 <Additional test>

### Phase 3 Feature Checklist (F-Series)

- [ ] F020 <Core implementation task>
- [ ] F021 [P] <Parallelizable task>
- [ ] F022 M <Schema or migration task if needed>

### Phase 3 Performance & Observability (Optional)

> Keep if Phase 3 introduces worker logging, metrics, or rate monitoring. Remove when not needed.

- [ ] F030 <Optional logging/metrics task>

### Phase 3 Details

**Worker Behavior & Lifecycle:**

- <Document polling cadence, concurrency expectations, and shutdown requirements.>

**Configuration / Scripts:**

```bash
# Example command placeholders
pnpm dev:worker
pnpm worker:start
```

---

## Phase 4: <Phase Title>

**Purpose:** <Describe how this phase integrates the API layer or similar scope.>

**Exit Gate:** <Specify the verification criteria before frontend work begins.>

### Phase 4 Test Plan (T-Series)

- [ ] T030 <API contract test>
- [ ] T031 <Rate limiting or error handling test>

### Phase 4 Feature Checklist (F-Series)

- [ ] F030 <Endpoint update task>
- [ ] F031 [P] <Parallel API task>
- [ ] F032 D <Documentation update>

### Phase 4 Performance & Observability (Optional)

> Retain when API-level metrics or logging tasks are required; otherwise delete this section.

- [ ] F040 <Optional monitoring endpoint>

### Phase 4 Details

**API Contract & Response Shape:**

- <Outline the response payload, error surface, and authentication rules.>

**Example Request / Response:**

```http
POST /api/v1/example
Authorization: Bearer <token>
```

---

## Phase 5: <Phase Title>

**Purpose:** <Summarize frontend or client-facing goals.>

**Exit Gate:** <State the UI/UX or data conditions needed before observability hardening.>

### Phase 5 Test Plan (T-Series)

- [ ] T040 <Hook/component test placeholder>
- [ ] T041 <Error handling test>

### Phase 5 Feature Checklist (F-Series)

- [ ] F040 <Primary UI update>
- [ ] F041 [P] <Parallel component change>

### Phase 5 Performance & Observability (Optional)

> Include only when this phase adds client-side telemetry, logging, or performance instrumentation.

- [ ] F050 <Optional telemetry task>

### Phase 5 Details

**UX / UI Notes:**

- <Document polling frequencies, state transitions, or copy updates.>

**Component Contracts:**

```tsx
// Placeholder for React component sample usage.
```

---

## Phase 6: <Phase Title>

**Purpose:** <Explain the observability/error-handling focus of Phase 6.>

**Exit Gate:** <List production-readiness metrics required before validation.>

### Phase 6 Test Plan (T-Series)

- [ ] T050 <Monitoring query test>
- [ ] T051 <Health endpoint failure mode test>

### Phase 6 Feature Checklist (F-Series)

- [ ] F060 <Monitoring query implementation>
- [ ] F061 [P] <Logging improvement>

### Phase 6 Performance & Observability (Optional)

> Retain if additional metrics, dashboards, or clean-up jobs are needed; remove when unused.

- [ ] F070 <Optional cleanup or telemetry task>

### Phase 6 Details

**Monitoring Strategy:**

- <Call out metrics captured, retention policies, and alert thresholds.>

**Sample Logs / Dashboards:**

```json
{"level":"info","event":"job_started","jobId":"<id>"}
```

---

## Phase 7: <Phase Title>

**Purpose:** <Describe final validation, manual testing, and release readiness goals.>

**Exit Gate:** <Define the criteria for declaring the feature complete.>

### Phase 7 Test Plan (T-Series)

- [ ] T060 <End-to-end validation test>
- [ ] T061 <Regression or resilience test>

### Phase 7 Feature Checklist (F-Series)

- [ ] F080 <Test suite implementation>
- [ ] F081 <Manual testing checklist>

### Phase 7 Performance & Observability (Optional)

> Keep for hardening tasks such as load testing or final telemetry adjustments; remove if unnecessary.

- [ ] F090 <Optional load/perf task>

### Phase 7 Details

**Validation Workflow:**

- <Outline automated + manual testing steps, acceptance criteria, and sign-off responsibilities.>

**Manual Testing Checklist Template:**

- [ ] <Step one>
- [ ] <Step two>

---

## Implementation Order

1. **Phase 1** – <Key artifacts or dependencies>
2. **Phase 2** – <Follow-on tasks>
3. **Phase 3** – <Continue summarizing remaining phases>
4. **Phase 4** – <...>
5. **Phase 5** – <...>
6. **Phase 6** – <...>
7. **Phase 7** – <...>

---

## Dependencies Overview

**Phase 1**: <Document which tasks block others; specify any migrations that gate downstream work.>

**Phase 2**: <Note cross-phase dependencies and parallelization opportunities.>

**Phase 3**: <Clarify requirements on queue/service availability, provider readiness, etc.>

**Phase 4**: <Describe API dependencies on queue/services.>

**Phase 5**: <State prerequisites from API/status endpoints.>

**Phase 6**: <List prerequisites for monitoring tasks.>

**Phase 7**: <Capture final validation dependencies.>

**Critical Path**: <Summarize key blocking sequence.>

**Parallelization Notes**: <Highlight safe concurrent workstreams by file or domain.>

---

## Parallel Execution Examples

**Example 1 (after initial migrations):**

```
/run-task F001 | /run-task F002 | /run-task T001
```

**Example 2 (after provider + queue ready):**

```
/run-task F020 | /run-task F021 | /run-task T020
```

**Example 3 (post API integration):**

```
/run-task F040 | /run-task F041 | /run-task T040
```

---

## Validation Checklist

- [ ] All required migrations applied and verified (F-series with M flag)
- [ ] All T-series tasks implemented and passing before dependent F-series tasks close
- [ ] Optional performance/observability sections evaluated and removed when not needed
- [ ] Documentation (D) updates completed and reviewed
- [ ] Environment variables configured for all phases
- [ ] Manual validation checklist executed

---

## Exit Criteria

<Define the measurable end state for the entire feature, including worker stability, UI polish, and system reliability goals.>

---

## Environment Variables

**Development (.env.local):**

```bash
# <Category>
KEY=value
```

**Production (.env.production):**

```bash
# <Category>
KEY=value
```

---

## Files to Create

- `<path/to/new/file.ts>` – <Describe purpose>
- `<path/to/another/new/file.ts>` – <Describe purpose>

## Files to Update

- `<path/to/existing/file.ts>` – <Summarize changes>
- `<another/path.tsx>` – <Summarize changes>

---

## Success Metrics

**Development Phase:**

- [ ] <Metric placeholder>
- [ ] <Metric placeholder>

**Production Readiness:**

- [ ] <Metric placeholder>
- [ ] <Metric placeholder>

---

## Notes

> **Workflow Tips**: <Insert guidance on running dev servers, workers, or scripts.>

> **Testing Guidance**: <Document how to simulate failures or retries.>

> **Operational Notes**: <Reference logging, monitoring, or support procedures.>

---

## Future Improvements: Production-Ready Queue System

### <Migration Path Placeholder>

- <List future architecture upgrades, tooling changes, and benefits.>

**Benefits:**

- ✅ <Benefit placeholder>
- ✅ <Benefit placeholder>

**Migration Steps:**

1. <Step placeholder>
2. <Step placeholder>

**Estimated Effort:** <Hours/days>

**When to Revisit:** <Conditions that trigger this improvement>

---

## Additional Future Considerations

### <Consideration Title>

- <Detail strategic enhancements, scaling tactics, or advanced features.>

### <Another Consideration>

- <Provide optional roadmap notes>
