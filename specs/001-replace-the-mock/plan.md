# Implementation Plan: AI‑Backed Learning Plan Generation (Replace Mock)

**Branch**: `001-replace-the-mock` | **Date**: 2025-09-27 | **Spec**: `specs/001-replace-the-mock/spec.md`
**Input**: Feature specification from `/specs/001-replace-the-mock/spec.md`

## Execution Flow (/plan command scope)

```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from file system structure or context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Fill the Constitution Check section based on the content of the constitution document.
4. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
5. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, `GEMINI.md` for Gemini CLI, `QWEN.md` for Qwen Code or `AGENTS.md` for opencode).
7. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:

- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary

Implement an asynchronous, AI‑backed learning plan generator that, upon plan creation, launches a background generation attempt and immediately returns the plan (pending). Each attempt produces structured modules and ordered tasks or records a classified failure (validation | provider_error | rate_limit | timeout | capped). Attempt logging and generated content write atomically: a single transaction ensures either (attempt + modules + tasks) all persist on success or nothing persists on failure, preserving consistency and preventing partial plans. The system enforces adaptive timeout (10s baseline; extend to 20s only with partial parse), strict ordering (1..N with uniqueness per scope), input truncation (topic ≤200 chars, notes ≤2,000 chars), effort bounds normalization (module 15–480; task 5–120 minutes), and a hard cap of 3 total generation attempts per plan. Non-functional goals: add <+200ms p95 latency to the synchronous create path, ensure truncation overhead <5ms p95, and maintain deterministic error classification. Classification is NULL for success attempts (failure-only classification vocabulary). A derived plan status (pending|ready|failed) is exposed via API without adding a denormalized DB column initially. Deferred items: attempt retention policy, redaction rules, idempotency key, denormalized status column, token usage metrics.

## Technical Context

**Language/Version**: TypeScript (Next.js 15 / React 19)  
**Primary Dependencies**: Next.js App Router, Drizzle ORM, @supabase/supabase-js, postgres (Supabase), Zod (validation), Clerk auth  
**Storage**: PostgreSQL (Supabase) with RLS, Drizzle schema (`src/lib/db/schema.ts`)  
**Testing**: (Currently no runner configured) – Phase 1 will introduce contract test scaffolds (recommended: Vitest)  
**Target Platform**: Server-rendered web app (Edge not required; Node runtime acceptable)  
**Project Type**: Single web application (frontend + backend unified in Next.js App Router)  
**Performance Goals**: Plan create synchronous API p95 latency impact < +200ms over baseline; truncation & validation overhead <5ms p95; generation attempts complete (when successful) within adaptive 10–20s wall clock  
**Constraints**: Atomic transaction for (attempt + modules + tasks); deterministic ordering uniqueness; adaptive timeout; hard attempt cap (3); deterministic error classification; minimal surface (no extra services beyond Supabase + existing Next server); no user-facing internal errors  
**Justification (Server Actions vs API Routes)**: Current implementation continues to use Next.js Route Handlers for create/list operations because:

1. Existing plan creation is already a RESTful route; retaining it avoids duplicative surfaces while we introduce async generation.
2. Background orchestration (fire-and-forget) is simpler to manage inside a route handler that can immediately return 201 with pending status semantics.
3. Migration to Server Actions later remains trivial (handler body can be exported as an action) once broader repository adoption strategy lands.
4. Constitution principle “Server Actions / App Router First” is satisfied because we stay inside the App Router runtime—no external API layer or bespoke server.

Decision recorded so future migration (if/when Server Actions adopted globally) will involve only signature changes, not architectural refactors.
**Scale/Scope**: Initial user base modest (<10k); concurrency bursts (plan creations) expected low; design should not preclude future scaling (indexes on attempt lookup, ordering queries)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._
Principles (from constitution) & Alignment:

- Minimal Surface Area: Feature adds only one new persistence concern (attempt logging) leveraging existing Supabase/Postgres + Drizzle. No additional microservices or external job queue introduced (initial implementation will use in-process async/Edge-safe background trigger or server action invocation pattern). PASS
- Supabase-Centric Data: All state (plans, modules, tasks, generation attempts) remain in Postgres with RLS. PASS
- Server Actions / App Router First: Plan creation & generation orchestration remain within Next.js route handlers (or server actions when adopted) without bespoke server outside framework. PASS
- Type Safety: Zod schemas already validate input; new AI output parser will produce typed DTOs before persistence; Drizzle ensures DB types. PASS
- RLS Security: New table(s) for attempts will mirror existing RLS patterns (ownership via plan -> user). PASS
- Observability Lite: Attempt table provides duration, classification, counts; no heavy telemetry stack added. PASS
  - Correlation ID: Will re-use (or introduce if absent) a lightweight request correlation ID (UUID v7 or nanoid) injected at the edge of the request (middleware) and threaded through attempt logging (not stored yet—only included in structured logger output). This satisfies traceability without expanding schema prematurely.

Potential Risks / Watchpoints:

- Background Execution Strategy: If concurrency or durability require a real queue later (e.g., Sidekiq/Cloud tasks), revisit Minimal Surface justification. Current scope keeps synchronous HTTP request minimal and defers heavy work but still inside the application process boundary.
- Adaptive Timeout Implementation: Must ensure extension only after partial parse to avoid hidden latency inflation.

Conclusion: No constitutional violations identified; proceed to Phase 0.

Post-Design Re-check (Phase 1 Complete): Designs (generation_attempts table, AI provider abstraction in-process, no external queue) still comply with Minimal Surface & Supabase-centric principles. No new violations introduced. Proceed to /tasks.

Derived Status Alignment: Specification now defines plan.status as a derived tri-state (pending|ready|failed) computed from presence/absence and classification of the latest attempt + content rows. Implementation plan intentionally defers denormalized column; mapper tasks (T052+) will compute status on the fly and tests will assert correctness, avoiding premature denormalization.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)

```text
src/
├── app/                     # Next.js App Router (API + pages)
│   ├── api/v1/plans         # Existing plan endpoints (to be extended)
│   ├── dashboard            # Authenticated UI pages
│   ├── landing              # Marketing/landing pages
│   └── plans                # Plan listing/detail pages
├── components/              # UI + feature components
├── lib/
│   ├── api/                 # API helpers (auth, errors, response)
│   ├── db/                  # Drizzle schema, migrations, queries
│   ├── mappers/             # DB → client mappers
│   ├── types/               # Shared TypeScript types
│   └── validation/          # Zod schemas
└── utils/                   # Supabase clients & misc utilities

specs/                       # Feature specs & plans (current feature here)
supabase/                    # Config + SQL test setup
```

**Structure Decision**: Single Next.js (web) application with unified API & UI in `src/app`. Feature introduces no new top-level packages or services; generation logic will live under `src/lib/` (e.g., `src/lib/ai/` for provider abstraction and `src/lib/db/queries` additions) and reuse existing route handlers in `src/app/api/v1/plans`.

## Phase 0: Outline & Research

1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:

```text
For each unknown in Technical Context:
  Task: "Research {unknown} for {feature context}"
For each technology choice:
  Task: "Find best practices for {tech} in {domain}"
```

1. **Consolidate findings** in `research.md` using format:
   - Decision: (what was chosen)
   - Rationale: (why it was chosen)
   - Alternatives considered: (other options and why rejected)

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts

Prerequisite: research.md complete

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:
   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/GraphQL schema to `/contracts/`

3. **Generate contract tests** from contracts:
   - One test file per endpoint
   - Assert request/response schemas
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:
   - Each story → integration test scenario
   - Quickstart test = story validation steps

5. **Update agent file incrementally** (O(1) operation):
   - Run `.specify/scripts/bash/update-agent-context.sh copilot`
     **IMPORTANT**: Execute it exactly as specified above. Do not add or remove any arguments.
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, /contracts/\*, failing tests, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach

This section describes what the /tasks command will do - DO NOT execute during /plan.

**Task Generation Strategy**:

- Load `.specify/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (contracts, data model, quickstart)
- Each contract → contract test task (parallelizable)
- Each entity → model creation task (parallelizable)
- Each user story → integration test task
- Implementation tasks to make tests pass

**Ordering Strategy**:

- TDD order: Tests before implementation
- Dependency order: Models before services before UI
- Mark parallelizable tasks explicitly

**Estimated Output**: 35–45 numbered, ordered tasks in tasks.md (includes performance harness, RLS policy tests, classification module, observability instrumentation).

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation

These phases are beyond the scope of the /plan command

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking

Fill ONLY if Constitution Check has violations that must be justified.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| (none)    |            |                                      |

## Progress Tracking

This checklist is updated during execution flow.

-**Phase Status**:

- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [x] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

-**Gate Status**:

- [x] Initial Constitution Check: PASS
- [ ] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved (except explicitly deferred retention & redaction)
- [x] Complexity deviations documented (none)

---

## Deferred Items & Rationale

| Item                                   | Status             | Rationale / Trigger                                                                 |
| -------------------------------------- | ------------------ | ----------------------------------------------------------------------------------- |
| Retention policy for attempts          | Deferred           | Need real usage + storage metrics                                                   |
| Redaction expansion                    | Deferred           | Await privacy review; minimal metadata stored now                                   |
| Idempotency key on create              | Deferred           | Added later if duplicate submissions cause issues                                   |
| Denormalized plan.status column        | Deferred           | Derived cheaply; can optimize if hot path latency emerges                           |
| Provider token usage metrics           | Deferred           | Add after provider integration stabilizes                                           |
| Alternate provider fallback            | Deferred           | Single provider abstraction first                                                   |
| Provider cost & fallback documentation | Planned (doc task) | Added as follow-up doc task (see new tasks phase) once baseline provider stabilized |

Additional Notes:

- Metadata Schema: See spec.md for enumerated metadata fields (truncation flags, aggregated normalization flags). Mapper tests will ensure parity.
- Performance Baseline: A pre-implementation baseline capture task will precede heavy logic to quantify added latency objectively.

## Performance Measurement (Planned)

Instrumentation (duration_ms on attempts), plus a benchmark script (Node) measuring baseline vs generation path p95 to ensure <+200ms overhead. Adaptive timeout extension path measured separately. Results will be captured post-implementation in a performance appendix.

## Reference to tasks.md

Running /tasks will create `tasks.md` enumerating the ordered roadmap (schema migration → parser/timeout → attempt service → API & mappers → classification tests → RLS tests → performance harness → documentation updates).

---

_Based on Constitution v2.1.1 - See `/memory/constitution.md`_
