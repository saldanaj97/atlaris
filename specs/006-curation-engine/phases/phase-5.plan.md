<!-- 1d4c65c6-1302-4605-b46b-faa0e557d49c da26bf09-7138-4364-b154-8f1fb1f7f0e2 -->

# Phase 5 — Worker Integration and Prompts

## Scope

- Integrate curation and micro‑explanations into the worker job flow with gating and time budget.
- Add/adjust prompts and a small AI utility for generating micro‑explanations.

## Files to modify/add

- Modify `src/lib/jobs/worker-service.ts`
- Modify `src/workers/plan-generator.ts`
- Modify `src/lib/ai/prompts.ts`
- Add `src/lib/ai/micro-explanations.ts`

## Implementation steps

1. Worker gating, orchestration, and time budget

- In `processPlanGenerationJob` (in `src/lib/jobs/worker-service.ts`):
  - After successful AI plan generation, if `process.env.ENABLE_CURATION !== 'false'`, run curation+attachments per task with bounded concurrency (e.g., 3–5) and early‑stop behavior.
  - Compute a soft time budget (e.g., 20–30s per job; or derive from queue policy). Ensure: attach at least 1 resource per task first; if budget nearly exhausted, skip remaining micro‑explanations or secondary source fetches.
  - Call `cleanupExpiredCache()` once per N jobs or on a periodic timer (see step 3) for TTL cache hygiene.

2. Curation integration (using Phase 2–3 modules)

- For each task:
  - Compose `CurationParams` from plan/job input (topic, learningStyle, weeklyHours, skillLevel, minScore from env `MIN_RESOURCE_SCORE` default 0.6).
  - Fetch candidates via adapters: `curateYouTube(params)` then (optionally) `curateDocs(params)` if fewer than 3 above cutoff or cached docs are cheap.
  - Blend/limit using `selectTop([...yt, ...docs], { minScore, maxItems: 3, preferDiversity: true })`.
  - Persist via `upsertAndAttach(db, taskId, candidates)` ensuring order and idempotency.

3. Periodic cache cleanup (worker process)

- In `src/workers/plan-generator.ts`, schedule a lightweight interval (e.g., every 30–60 minutes) to call `cleanupExpiredCache()`; also call once at worker start. Ensure errors are logged but non‑fatal.

4. Micro‑explanations generation and persistence

- Add `src/lib/ai/micro-explanations.ts` with a small helper wrapping the provider: build prompts, use Zod schema with `streamObject`, and return a concise markdown string.
- In `processPlanGenerationJob`, after resources are attached (and if budget allows), generate micro‑explanations per task and append to `tasks.description` (add/update a DB helper if needed in existing queries module). Respect time budget; skip if tight.

5. Prompts updates

- In `src/lib/ai/prompts.ts`:
  - Add `buildMicroExplanationSystemPrompt()` and `buildMicroExplanationUserPrompt({ topic, moduleTitle, taskTitle, skillLevel })` requesting 2–3 sentences and an optional short practice exercise; require markdown‑safe output.
  - Keep plan generation prompts unchanged, unless a small note helps consistency (optional, non‑breaking).

6. Observability and safety

- Add structured logs: counts of candidates fetched, cache hits (if available from adapters), resources attached, micro‑explanations generated/skipped, elapsed time vs. budget.
- Wrap external calls with lightweight retries where already standardized (e.g., `p-retry` in adapters); fail soft on micro‑explanations.

## Essential signatures (concise)

```ts
// src/lib/ai/micro-explanations.ts
export async function generateMicroExplanation(
  provider: import('./provider').AiPlanGenerationProvider,
  args: {
    topic: string;
    moduleTitle?: string;
    taskTitle: string;
    skillLevel: 'beginner' | 'intermediate' | 'advanced';
  }
): Promise<string>;

// src/lib/ai/prompts.ts additions
export function buildMicroExplanationSystemPrompt(): string;
export function buildMicroExplanationUserPrompt(args: {
  topic: string;
  moduleTitle?: string;
  taskTitle: string;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
}): string;

// src/lib/jobs/worker-service.ts (calls into Phase 2–3 modules)
// pseudo-flow inside processPlanGenerationJob on success
await maybeCurateAndAttachResources(planId, tasks, params, {
  minScore,
  timeBudgetMs,
});
await maybeGenerateMicroExplanations(planId, tasks, { timeBudgetMs });

// src/workers/plan-generator.ts (startup + periodic)
import { cleanupExpiredCache } from '@/lib/curation/cache';
```

## Config

- `ENABLE_CURATION` (default true in dev/test).
- `MIN_RESOURCE_SCORE` (default 0.6) already respected by ranking/selection.
- Reuse TTL envs from earlier phases; no new envs required here.

## Risks/mitigation

- Time budget overrun → prioritize 1 resource per task, skip micro‑explanations when tight.
- API quotas → rely on cache; tolerate partial diversity.
- DB contention → continue using unique constraints/idempotent attachment.

## To-dos

- [x] Gate curation and micro‑explanations in worker via ENABLE_CURATION
- [x] Invoke adapters and selectTop; upsertAndAttach 1–3 per task
- [x] Enforce per-job time budget and early-stop logic
- [x] Schedule periodic cleanupExpiredCache in worker process
- [x] Add micro-explanations helper using prompts + streamObject
- [x] Append micro‑explanations to tasks.description respecting budget
- [x] Add micro‑explanations prompts builders in prompts.ts
- [x] Add structured logs for curation, micro‑ex, timing, errors
