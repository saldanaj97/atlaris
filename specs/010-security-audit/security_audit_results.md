# Security Audit – Core Library

## Scope & Approach

- **Target**: `src/lib/**` (non-UI runtime and domain logic).
- **Methods**: Manual review of database access patterns, job queue handling, OAuth/token management, AI orchestration, and integrations. Static analysis only—no dynamic testing or dependency scanning performed per request.

## Findings & Recommendations

### 1. Raw SQL assembly in job queue introduces injection risk

- **Location**: `src/lib/jobs/queue.ts` (`buildJobTypeArrayLiteral` and `getNextJob`).
- **Issue**: Job type filters are interpolated into a raw SQL array literal before being passed to `sql.raw`. Any unexpected job type string (for example, from a future feature flag, misconfigured worker, or compromised background process) would be inserted into the query without escaping, opening a path for SQL injection against the `job_queue` table.
- **Impact**: Medium—currently mitigated by hard-coded enums, but the pattern is brittle and easy to misuse.
- **Recommendation**: Replace the manual literal builder with parameterised bindings (e.g., `sql.join` / `inArray`) or use PostgreSQL array parameters to ensure the driver handles escaping. Add unit tests that fail if non-enum job types reach the query path.
- **Evidence**: `buildJobTypeArrayLiteral` constructs a string literal and `sql.raw` injects it into the query filter.【F:src/lib/jobs/queue.ts†L30-L99】

### 2. Task description updates store untrusted HTML verbatim

- **Location**: `src/lib/db/queries/tasks.ts` (`appendTaskDescription`).
- **Issue**: Additional description text (likely derived from AI output or user input) is concatenated directly into the task record. Without sanitisation, any HTML/markdown rendered later could execute as stored XSS.
- **Impact**: High—compromised descriptions can target every viewer of the plan.
- **Recommendation**: Normalise inputs before persistence (e.g., strip/escape HTML, store in structured rich-text format, or flag content for review). Pair with contextual escaping on render and consider content security policies on consuming surfaces.
- **Evidence**: The function appends `additionalDescription` directly to the existing `description` column.【F:src/lib/db/queries/tasks.ts†L136-L162】

### 3. Service-role database client bypasses RLS in request handlers

- **Location**: `src/lib/db/drizzle.ts`; consumed by request-layer helpers such as `src/lib/api/schedule.ts`.
- **Issue**: The Drizzle client connects with the database owner role, explicitly bypassing Supabase RLS. Several request-time helpers call this client directly, so any missed tenant check or new helper risks exposing cross-tenant data.
- **Impact**: High—RLS is the primary defence-in-depth control; bypassing it in user-facing pathways magnifies damage from logic bugs.
- **Recommendation**: Restrict the service-role client to background/worker contexts. For request handlers, require a Supabase client that enforces the caller's JWT or wrap Drizzle calls with a guard that verifies `userId` before executing. Add automated tests to ensure helper functions fail when invoked without matching user IDs.
- **Evidence**: `db` is a superuser connection and is used directly in request helpers like `getPlanSchedule`, which must manually enforce ownership checks.【F:src/lib/db/drizzle.ts†L1-L31】【F:src/lib/api/schedule.ts†L1-L111】

### 4. Plan loader lacks tenant scoping guardrails

- **Location**: `src/lib/db/queries/plans.ts` (`getLearningPlanWithModules`).
- **Issue**: This helper fetches a plan and its modules without checking the owning user. If reused in an authenticated surface without additional filtering, an attacker could enumerate arbitrary plans by ID.
- **Impact**: Medium—currently unused in request paths, but the helper is a latent footgun.
- **Recommendation**: Require a `userId` argument (mirroring `getLearningPlanDetail`) and enforce ownership in the query, or add lint/test coverage that forbids exporting multi-tenant data without user filters.
- **Evidence**: The function accepts only `planId` and runs against the superuser `db` connection with no tenant predicate.【F:src/lib/db/queries/plans.ts†L34-L45】

## Additional Observations

- OAuth state tokens are cached in-memory only (`src/lib/integrations/oauth-state.ts`), which is acceptable for local development but will break in multi-instance deployments; migrate to a shared store before scaling.
- Prompt assembly paths ingest raw user text for AI providers. Continue monitoring downstream renderers to ensure generated content is escaped and that rate limits mitigate prompt-injection loops.

## Next Steps

1. Prioritise remediation of Findings 2 and 3 to close cross-tenant and stored-XSS risks.
2. Update coding standards to forbid raw SQL string assembly and unauthenticated plan lookups without tenant scoping.
3. Re-run a focused review after fixes land to confirm mitigations and catch regressions.
