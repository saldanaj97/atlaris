# Phase 0 Research: AI‑Backed Learning Plan Generation

Date: 2025-09-27  
Scope: Resolve unknowns & codify foundational decisions for implementing real AI generation replacing mock logic.

## Decision Log

### 1. AI Provider Abstraction Layer

- Decision: Introduce a thin provider interface `AiPlanGenerator` (e.g., `generatePlan(input: GenerationInput): Promise<RawModelOutput>`), implemented initially with a single provider (OpenAI or Anthropic TBD) but isolated behind `src/lib/ai/` to allow future swap.
- Rationale: Keeps minimal surface (one module) while avoiding hard-coding provider-specific payload/stream parsing across route handlers.
- Alternatives considered:
  - Direct inline fetch in route handler: Faster initial dev, but scatters retry/timeout/stream parsing logic; harder to test.
  - Full strategy registry + dynamic provider selection: Over-engineered for single provider initial scope.

\n### 2. Invocation Mode (Streaming vs Single Response)

- Decision: Use streaming completion (if provider supports) to enable early partial-parse detection used by adaptive timeout extension.
- Rationale: Needed to justify adaptive timeout (extend only if ≥1 module header parsed). Streaming allows early cancel if structure obviously invalid.
- Alternatives considered:
  - Single blocking response: Simpler, but cannot observe partial output to decide on extending timeout; increases risk of hitting hard 10s cutoff without nuance.

\n### 3. Output Format Contract

- Decision: Model instructed to output strict JSON with top-level `modules: [{ title, estimated_minutes, tasks: [{ title, estimated_minutes }] }]`.
- Rationale: Matches domain entities; minimizes post-processing; direct mapping to persistence structure.
- Alternatives considered:
  - Multi-step extraction (natural language → JSON via regex): Fragile and slower.
  - JSON Lines per module: More complex ordering logic and increases failure modes.

\n### 4. Parser & Validation Pipeline

- Decision: Pipeline stages: raw stream → incremental JSON buffer → parse attempt → structural validation (non-empty modules) → ordering assignment → effort normalization.
- Rationale: Clear separation enables precise classification (validation vs provider_error).
- Alternatives considered:
  - Blind JSON.parse after full accumulation: Delays detection of parse viability and prevents adaptive timeout signal.

\n### 5. Adaptive Timeout Implementation

- Decision: Start a 10s controller; listen for: (a) first valid module object parsed before 10s → extend once up to 20s total; else abort at 10s; never extend more than once.
- Rationale: Meets spec and bounds resource usage; deterministic rule.
- Alternatives considered:
  - Exponential backoff extension: Unbounded complexity & violates deterministic latency budget.
  - Always 20s: Wastes resources when no useful partial output.

\n### 6. Attempt Logging Strategy

- Decision: Create new table `generation_attempts` (distinct from `plan_generations` history which appears oriented to full regenerations) capturing per-attempt metadata: status, classification, duration_ms, modules_count, tasks_count, truncation_flags, normalization_flags, model, prompt_hash.
- Rationale: `plan_generations` currently lacks classification & counts fields; adding them might semantically overload regeneration history vs initial attempt tracing & future manual retries.
- Alternatives considered:
  - Reuse `plan_generations`: Would require adding many nullable columns or retrofitting semantics; conflates version history with attempt diagnostics.
  - Store attempt details in JSONB column of plan: Harder to query, index, or prune; mixes concerns.

\n### 7. Atomic Persistence Pattern

- Decision: Wrap (attempt insert + module inserts + task inserts) in a single transaction using Drizzle `db.transaction(async (tx) => ...)`. On validation failure throw before any inserts (except attempt stub) OR log attempt inside transaction just before committing after content inserted (selected: log attempt last with final counts then commit).
- Rationale: Prevents orphan attempts referencing non-existent modules/tasks and ensures counts correct.
- Alternatives considered:
  - Insert attempt first then rollback on failure: Requires attempt deletion or status mutation; more write churn.
  - Insert attempt after commit: Loses detailed failure timing/classification if content insertion raises.

\n### 8. Ordering Guarantee Mechanism

- Decision: Derive module order sequentially in memory (1..N) then rely on unique constraint (plan_id, order). Similarly tasks (module_id, order). Let DB enforce uniqueness to catch race anomalies (should not trigger under single-attempt transaction).
- Rationale: Simplicity & alignment with existing constraints.
- Alternatives considered:
  - Generate random ordering then sort: Unnecessary complexity.

\n### 9. Effort Normalization Handling

- Decision: Clamp values out-of-range (module 15–480, task 5–120) and record a boolean `normalized` flag aggregated per attempt (e.g., counts or list of affected indices in attempt metadata JSON).
- Rationale: Maintains user value (still get plan) while surfacing internal quality signals for future analytics.
- Alternatives considered:
  - Reject entire attempt if any value out of range: Higher failure rates from minor model drift.

\n### 10. Input Truncation Metadata

- Decision: Store original lengths and boolean flags in attempt metadata JSON (e.g., `{ input: { topic: { truncated: true, original_length: 243 }, notes: {...} } }`).
- Rationale: Satisfies requirement to record truncation without PII leakage (no full original text stored again).
- Alternatives considered:
  - Store full original text: Increases risk & storage cost.

\n### 11. Error Classification Rules

- Decision: Mapping precedence: (validation errors) → validation; (explicit rate limit HTTP status or provider code) → rate_limit; (timeout triggered) → timeout; (others) → provider_error.
- Rationale: Deterministic; mutually exclusive categories.
- Alternatives considered:
  - Free-form string labels: Reduces testability.

\n### 12. Retention Policy (Deferred)

- Decision: Mark retention unspecified; design attempts table with created_at index to allow future pruning job (e.g., keep last N=20 per plan or last 90 days). No automatic deletion now.
- Rationale: Avoid premature policy; structure supports change.
- Alternatives considered:
  - Hard-coded 30-day TTL now: Risk of losing early diagnostic data prematurely.

\n### 13. Redaction Policy (Deferred)

- Decision: While storing prompt/payload metadata, exclude raw user notes beyond length and truncation flag; store hash of full prompt (`prompt_hash`) for dedup/analytics without leaking content.
- Rationale: Minimizes sensitive data retention until policy clarified.
- Alternatives considered:
  - Store entire prompt JSON: Potential privacy concern.

\n### 14. Background Execution Approach (MVP)

- Decision: Perform generation within the POST request using `Promise.race([generation, timeout])` but return immediately after plan row creation by deferring heavy work via `void startGeneration(planId, userId)` (fire-and-forget). (Implementation detail for planning; actual function scheduled with minimal awaiting). If hosting constraints require, later move to edge-friendly queue or Cron triggers.
- Rationale: Avoid introducing new infra while still offloading latency from user response path.
- Alternatives considered:
  - Dedicated queue (e.g., Redis, Supabase functions): More operational overhead now.

\n### 15. Idempotency (Deferred)

- Decision: No idempotency key in MVP; rely on client avoiding rapid duplicate submissions. Provide deterministic attempt cap enforcement.
- Rationale: Scope control.
- Alternatives considered:
  - Implement key header now: Additional schema/logic overhead.

### 16. Adaptive Timeout Deterministic Threshold

- Decision: Treat early extension eligibility window as first well‑formed module parsed before 9.5s (95% of base budget) then extend deadline to 20s exactly once.
- Rationale: Prevent extending too late (e.g., at 9.99s) which would skew p95; deterministic and testable.
- Alternatives considered: dynamic threshold based on modules count (added complexity, low incremental benefit).

### 17. Classification Nullable on Success

- Decision: `classification` column nullable; success attempts store NULL; failure attempts store one of the enumerated failure causes.
- Rationale: Removes semantic ambiguity of assigning a non-failure label to success; simplifies analytics queries filtering failures.
- Alternatives considered: special "success" enumerant (adds noise to failure-oriented dashboards), separate failure_classification column (more columns, little gain).

### 18. Readiness Status Exposure (Derived)

- Decision: API exposes `status` field (pending | ready | failed) without adding a DB column; computed from modules existence + latest attempt failure + cap exhaustion.
- Rationale: Avoids schema churn; derived logic adequate for low-scale reads.
- Alternatives considered: stored status column (premature optimization), omission (pushes complexity to client inference).

### 19. Concurrency & Idempotency Stance

- Decision: No idempotency key MVP; rely on client avoiding spamming create; concurrent duplicate submissions create distinct plans intentionally.
- Rationale: Scope containment + simpler migration path if needed later; attempt cap applies per plan not across duplicates.
- Alternatives considered: header-based key (extra validation + index), request hash de-dup (collision and complexity risk now).

## Open Items (Deferred)

- Retention pruning exact policy.
- Formal redaction whitelist/blacklist rules.
- Provider choice finalization (assumed single; if Anthropic vs OpenAI selection needed, add follow-up decision).

## Risks & Mitigations

| Risk                                             | Impact                 | Mitigation                                               |
| ------------------------------------------------ | ---------------------- | -------------------------------------------------------- |
| Long-running generation ties up server resources | Increased memory usage | Enforce hard cap (20s) & streaming early abort           |
| Model returns malformed JSON                     | Attempt wasted         | Robust incremental parse + classification validation     |
| Transaction contention under burst               | Latency spike          | Short transactions (insert only) & indexes on FK columns |
| Future provider swap requires refactor           | Slow iteration later   | Thin interface + single impl now                         |

\n## Next Steps (for Phase 1)

1. Define `generation_attempts` table schema & RLS.
2. Specify AI provider interface TypeScript types.
3. Draft POST /api/v1/plans updated contract & optional GET /api/v1/plans/:id/attempts (if included in MVP) or embed latest attempt in plan detail.
4. Create quickstart demonstrating pending → ready transition.
