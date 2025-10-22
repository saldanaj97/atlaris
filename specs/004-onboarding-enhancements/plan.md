# Onboarding Enhancements: Deadline and Scheduling

This plan defines concrete, repo-grounded steps to collect deadline and optional start date during onboarding, persist the values, and produce deadline-aware plans in the AI generation pipeline.

## Objective

- Collect a required deadline and an optional start date in onboarding.
- Persist to DB (schema already supports `startDate` and `deadlineDate` as PostgreSQL date columns).
- Pass the values through API → job → orchestrator → provider prompts so generated plans are deadline-aware.

## Current State (facts)

- UI onboarding form exists at `src/components/plans/OnboardingForm.tsx` (4 steps: topic, skill level, weekly hours, learning style; optional notes).
- Validation schemas at `src/lib/validation/learningPlans.ts`:
  - `createLearningPlanSchema` supports `startDate` and `deadlineDate` as optional ISO date strings.
  - `onboardingFormSchema` does not currently include start/deadline fields.
- Mapping at `src/lib/mappers/learningPlans.ts`:
  - Maps `OnboardingFormValues` to `CreateLearningPlanInput` (does not pass dates).
- API route `POST /api/v1/plans` at `src/app/api/v1/plans/route.ts`:
  - Parses with `createLearningPlanSchema`.
  - Persists `startDate`/`deadlineDate` to DB (via `atomicCheckAndInsertPlan`).
  - Enqueues background job without timeline fields in `PlanGenerationJobData`.
- Worker `src/lib/jobs/worker-service.ts` and types `src/lib/jobs/types.ts`:
  - `PlanGenerationJobData` lacks start/deadline.
  - Validation schema for job payload excludes them.
- Orchestrator and providers:
  - `src/lib/ai/provider.ts::GenerationInput` doesn’t include dates.
  - `src/lib/ai/prompts.ts` and `src/lib/ai/providers/*` don’t reference dates.
- DB schema `src/lib/db/schema.ts`:
  - `startDate: date('start_date')` and `deadlineDate: date('deadline_date')`.
  - Seed hints: Values for these columns should be ISO date strings `YYYY-MM-DD`.

## Acceptance Criteria mapping

- Deadline input with validation → Onboarding UI + `onboardingFormSchema` updates.
- Optional start date (defaults to “now” if omitted) → Onboarding UI + mapping default.
- Integrate deadline and pacing guidance into AI prompts → `prompts.ts` and providers.
- Persist user inputs to DB → already supported in API route; ensure `createPlan` payload includes dates.
- Generated plans respect deadline constraints → pass dates through job data → orchestrator → providers → prompt context.

## Implementation Steps

### 1) UI: Add Timeline Step to Onboarding

File: `src/components/plans/OnboardingForm.tsx`

- Addresses: Sub-issue #40 (Add deadline input and persist) — https://github.com/saldanaj97/atlaris/issues/40; Sub-issue #41 (Optional start date) — https://github.com/saldanaj97/atlaris/issues/41

- Add a new step after the current steps to collect:
  - Start date (optional)
  - Deadline date (required)
- Increment `TOTAL_STEPS` and update navigation guard logic.
- Use native input elements to minimize dependencies:
  - `<input type="date" id="startDate" name="startDate" />`
  - `<input type="date" id="deadlineDate" name="deadlineDate" required />`
- Update `FormState` with `startDate?: string` and `deadlineDate: string`.
- Update `stepHasRequiredValues` and `validateStep` to enforce deadline selection and show inline error for missing deadline.

Notes:

- Input format from `<input type="date">` is `YYYY-MM-DD` which matches DB date columns and current seed assumptions.

### 2) Validation: Enforce Rules at Onboarding Schema Layer

File: `src/lib/validation/learningPlans.ts`

- Addresses: Sub-issue #40 — https://github.com/saldanaj97/atlaris/issues/40; Sub-issue #41 — https://github.com/saldanaj97/atlaris/issues/41

- Extend `onboardingFormSchema` with:
  - `startDate: z.string().date().optional()` (accepts `YYYY-MM-DD`)
  - `deadlineDate: z.string().date()` (required)
- Add refinements (onboarding-only) per acceptance criteria:
  - Deadline must be a valid date string and must be today or later.
  - If `startDate` is provided, it must be today or later.
  - If both provided, `startDate <= deadlineDate`.
  - Optionally cap deadline to a reasonable future bound (e.g., within 50 years) per issue guidance.
- Keep `createLearningPlanSchema` as-is to avoid breaking other API clients; onboarding layer provides stronger constraints.

### 3) Mapping: Include Dates in Create Payload

File: `src/lib/mappers/learningPlans.ts`

- Addresses: Sub-issue #40 — https://github.com/saldanaj97/atlaris/issues/40; Sub-issue #41 — https://github.com/saldanaj97/atlaris/issues/41

- Update `OnboardingFormValues` normalization to pass through `startDate` (optional) and `deadlineDate` (required).
- Ensure the returned object for `createLearningPlanSchema.parse()` includes `startDate` and `deadlineDate` as `YYYY-MM-DD` strings (native input already provides correct format).
- Do not coerce to Date objects; API route and DB expect strings.

### 4) API: Ensure Dates Flow into Background Job

File: `src/app/api/v1/plans/route.ts`

- The insert payload already persists `startDate`/`deadlineDate`.
- Update the enqueued job data to include these fields so generation is deadline-aware:
  - Extend the `jobData` to include `startDate` (string | null) and `deadlineDate` (string | null), populated from `body.startDate` and `body.deadlineDate`.

- Relation to sub-issues: Prerequisite for Sub-issue #42 (AI prompt/generation with deadline/pacing) — https://github.com/saldanaj97/atlaris/issues/42; also supports #40 and #41 by ensuring persistence flows downstream.

### 5) Job Types and Worker: Add Timeline to Payload and Validation

Files:

- `src/lib/jobs/types.ts`: extend `PlanGenerationJobData` with
  - `startDate: string | null`
  - `deadlineDate: string | null`
- `src/lib/jobs/worker-service.ts`:
  - Extend `planGenerationJobDataSchema` with the above fields:
    - `z.string().date().optional().nullable()` for startDate
    - `z.string().date().optional().nullable()` for deadlineDate
  - Pass both fields through to `runGenerationAttempt({ input: … })`.

- Addresses: Sub-issue #42 — https://github.com/saldanaj97/atlaris/issues/42 (deadline-aware generation); supports #41 by carrying start date forward.

### 6) Orchestrator and Provider Input Types

Files:

- `src/lib/ai/provider.ts`:
  - Extend `GenerationInput` with
    - `startDate?: string | null`
    - `deadlineDate?: string | null`
- `src/lib/ai/orchestrator.ts`:
  - Types will flow through; no logic change required other than the expanded `GenerationInput` type.

- Addresses: Sub-issue #42 — https://github.com/saldanaj97/atlaris/issues/42

### 7) Prompts and Providers: Add Deadline/Pacing Context

Files:

- `src/lib/ai/prompts.ts`:
  - Extend `PromptParams` with `startDate?: string | null` and `deadlineDate?: string | null`.
  - Update `buildSystemPrompt()` to explicitly mention deadlines and pacing constraints in the instructions.
  - Update `buildUserPrompt(p)` to include lines for:
    - `Start date: {p.startDate ?? "today"}`
    - `Deadline: {p.deadlineDate ?? "none"}`
    - Keep existing Topic / Skill / Style / Weekly Hours.
- `src/lib/ai/providers/{openrouter,google,cloudflare}.ts`:
  - Pass `startDate` and `deadlineDate` from `GenerationInput` to `buildUserPrompt`.
  - No model-specific logic needed; the additional context is provided through prompt text.

- Addresses: Sub-issue #42 — https://github.com/saldanaj97/atlaris/issues/42

### 8) Optional parity: Server Action Path

File: `src/app/plans/actions.ts`

- Not used by `OnboardingForm` (which calls the API path), but for parity:
  - Extend `GenerateLearningPlanParams` and the call to `atomicCheckAndInsertPlan(...)` to include dates.
  - Pass dates into `runGenerationAttempt` input.
  - This can be done after the primary flow above.

## Testing

Add or extend tests in keeping with the repository’s testing structure (Vitest):

- Unit (validation)
  - File: `tests/unit/validation/learningPlans.dates.spec.ts`
    - Valid deadline today/tomorrow; reject past deadline.
    - Optional start date allows empty; when provided, reject past start date.
    - Enforce `startDate <= deadlineDate`.
    - Ensure strings conform to `YYYY-MM-DD`.
- Integration (API + job payload)
  - File: `tests/integration/api/plans.onboarding-dates.spec.ts`
    - POST `/api/v1/plans` with dates persists to DB (check row has ISO dates).
    - Job enqueued with date fields present and valid.
- Integration (worker → orchestrator → prompts)
  - File: `tests/integration/workers/plan-generation.dates.spec.ts`
    - Inject job data with dates; verify `runGenerationAttempt` is called with `GenerationInput` including dates.
    - Stub provider to capture `buildUserPrompt` params and assert deadline/start lines are present.
- E2E
  - File: `tests/e2e/plan-generation.test.ts` (extend)
    - Complete onboarding with deadline → plan generated; prompts captured in provider mock contain deadline context.
    - Onboarding without start date uses default “today” in prompt.

## Related sub-issues

As we go through each sub issues, make sure that we address their specific requirements and testing needs as well.

These plan steps explicitly track and implement the following sub-issues under parent Issue #33:

- #40 — Add deadline input to onboarding and persist to database
  - Link: https://github.com/saldanaj97/atlaris/issues/40
  - Addressed by Steps: 1 (UI), 2 (Validation), 3 (Mapping), 4 (API), Testing sections (unit/integration/E2E for persistence and validation)

- #41 — Optionally collect start date and pass to scheduling
  - Link: https://github.com/saldanaj97/atlaris/issues/41
  - Addressed by Steps: 1 (UI), 2 (Validation), 3 (Mapping), 4 (API), 5 (Job/Worker propagation), 6 (Input types), 7 (Prompts/Providers), Testing sections

- #42 — Include deadline and pacing guidance in AI prompt/generation
  - Link: https://github.com/saldanaj97/atlaris/issues/42
  - Addressed by Steps: 4 (prereq data flow), 5 (Job/Worker), 6 (Orchestrator/Provider types), 7 (Prompts/Providers), Testing sections (integration/worker/E2E)

Note: Use existing provider mock pattern under `tests/helpers/mockProvider.ts` to assert prompt inputs where applicable.

## Non-goals / Out of scope

- Introducing a third-party date picker dependency; we will use native `<input type="date">`.
- Schema migrations (DB already supports both dates).
- Timeline estimation UI preview prior to generation (can be a follow-up).

## Rollout Checklist

- [ ] UI step added; local validation shows errors inline.
- [ ] `onboardingFormSchema` validates date rules.
- [ ] Mapping passes `startDate` and `deadlineDate` to `createPlan`.
- [ ] API route persists to DB (confirmed by integration test).
- [ ] Job payload carries both fields; worker schema updated.
- [ ] `GenerationInput` extended end-to-end; providers include prompt context.
- [ ] Unit/integration/E2E tests cover happy path and edge cases.

## References

- Repo files:
  - `src/components/plans/OnboardingForm.tsx`
  - `src/lib/validation/learningPlans.ts`
  - `src/lib/mappers/learningPlans.ts`
  - `src/app/api/v1/plans/route.ts`
  - `src/lib/jobs/types.ts`
  - `src/lib/jobs/worker-service.ts`
  - `src/lib/ai/provider.ts`, `src/lib/ai/prompts.ts`, `src/lib/ai/providers/*`
  - DB schema: `src/lib/db/schema.ts` (`start_date`, `deadline_date`)
  - Seed guidance on ISO date strings: `src/lib/db/seed.ts` (comment and examples)
- Docs:
  - Next.js 15 server actions & forms with Zod validation
  - Zod date validation: `z.string().date()`, `z.coerce.date()`, min/max checks and refinements
  - Drizzle (Postgres) date handling: store `YYYY-MM-DD` string for `date` columns
