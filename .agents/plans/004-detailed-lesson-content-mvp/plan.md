# Detailed Lesson Content MVP Plan

Date: 2026-05-15
GitHub issue: https://github.com/saldanaj97/atlaris/issues/328

## Goal

Replace placeholder lesson prose with real generated lesson content while keeping cost exposure close to zero and preserving future tier upgrades.

The core discipline: do not generate content nobody asked to read. Lazy generation plus persistence is the only sane MVP path while the product depends on free models.

## Verified Current State

- Plan generation persists modules and flat tasks. There is no subtask table or nested subtask model.
- Module detail renders each task as a lesson inside an accordion.
- The lesson body currently comes from deterministic placeholder content.
- The UI explicitly tells users that placeholder text will later be replaced by AI-generated learning material.
- Existing module/task rows store title, description, order, and estimated minutes. Tasks also have progress and resource relations.
- Existing RLS policies already scope modules and tasks through the owning plan.
- The schema source of truth is under `supabase/schema`, not a `src/lib/db/schema` tree.
- AI model selection and tier gating already flow through a shared model resolver and provider factory.
- Free/starter tiers currently receive free-access models only; pro can receive the broader catalog.

## External Constraints

- OpenRouter free model variants are request-limited. Current docs state 20 requests per minute and either 50 or 1000 `:free` requests per day depending on account credit history.
- The `openrouter/free` router selects an available free model and is meant for experimentation, prototyping, education, and low-volume use.
- Free model availability, latency, and capability can vary. The router may select different backends over time.
- The Models API exposes current model metadata, pricing, max completion tokens, and supported parameters. Model availability is not static.

Sources:

- https://openrouter.ai/docs/api/reference/limits
- https://openrouter.ai/docs/guides/routing/routers/free-router
- https://openrouter.ai/docs/guides/overview/models

## Options Considered

### Option 1: Generate All Lesson Content During Plan Creation

Pros:

- Simplest user experience after plan creation.
- No additional click or loading state on module detail.

Cons:

- Turns one plan generation into a large, slow, failure-prone operation.
- Generates content for modules users may never open.
- Burns free-model output capacity immediately.
- Makes initial plan creation harder to debug and retry.

Verdict:

- Reject for MVP. This is the comfortable demo path, not the survival path.

### Option 2: Generate One Task Lesson At A Time

Pros:

- Small prompts and smaller validation surface.
- Easy retry per task.
- Strong locality: only generate the exact lesson requested.

Cons:

- A 3-6 module plan with 3-6 tasks per module can require 9-36 provider requests.
- The daily free-model cap becomes the bottleneck before token cost does.
- Users may hit repeated loading states inside one module.

Verdict:

- Keep as fallback only if module-batch output proves unreliable.

### Option 3: Generate One Module Batch On Demand

Pros:

- One provider request can fill all tasks in an opened module.
- A full plan usually costs 3-6 requests instead of 9-36.
- Output remains bounded by module size.
- Caching makes the request a one-time cost per module.
- Fits the existing module detail page and sequential module locks.

Cons:

- Parser must verify that every task in the module received content.
- A provider failure affects the whole module.
- Prompt/output size needs a strict word/token budget.

Verdict:

- Recommended MVP path.

## Recommended Architecture

### Product Behavior

1. User creates a plan and receives modules/tasks as they do today.
2. User opens a module detail page.
3. If the module is locked, no content generation happens.
4. If the module is unlocked and content is already ready, render cached content.
5. If the module is unlocked and content is missing, show a concise empty state with a clear "Generate lessons" action.
6. When the user explicitly clicks the action, request module lesson generation for the entire module batch.
7. The server checks ownership, tier, quota, and current generation status.
8. The server generates content for every task in the module in one provider call.
9. The server validates and persists the structured content.
10. The UI replaces placeholder prose with generated content.
11. While generation runs, keep the module page usable: show progress/pending copy, keep resources and task metadata visible, and avoid a blank page.

### Persistence Shape

Recommended MVP schema:

- Add module-level lesson generation status and metadata.
- Add task-level detailed lesson content.
- Keep resource links in the existing resource tables.
- Keep task descriptions as short summaries.

Recommended state model:

- `not_generated`: no lesson content exists yet.
- `generating`: a request is in progress.
- `ready`: all task lesson content for the module is persisted.
- `failed`: the last generation attempt failed and can be retried.

Recommended content shape:

```json
{
  "version": 1,
  "blocks": [
    { "type": "heading", "text": "..." },
    { "type": "paragraph", "text": "..." },
    { "type": "example", "title": "...", "text": "..." },
    { "type": "practice", "text": "..." },
    { "type": "takeaways", "items": ["...", "..."] },
    { "type": "completion_criteria", "items": ["...", "..."] }
  ]
}
```

Do not store raw HTML. Avoid markdown unless there is a sanitizer and a narrow allowed syntax. Structured blocks are more annoying up front and cheaper later.

### Generation Contract

Prompt inputs:

- Plan topic.
- Skill level.
- Learning style.
- Module title and description.
- Ordered task IDs, titles, descriptions, and estimated minutes.
- Hard output budget per task.

Output requirements:

- JSON only.
- One content object per task ID.
- No extra task IDs.
- No missing task IDs.
- No external links in lesson body; use the existing resources system for links.
- No HTML.
- No unsafe instructions that tell users to ignore app guidance.
- Concise content sized to the task estimate.

### Quota And Tier Gating

Add a distinct lesson generation meter. Do not hide this under regeneration quota.

Initial recommended caps:

- Free: small monthly module-generation allowance, enough to experience the product but not enough to drain the shared free provider key.
- Starter: higher monthly module-generation allowance, still free-model-only until paid model rollout is intentional.
- Pro: high or unlimited allowance plus access to paid model options later.

Also add or preserve:

- Existing high-cost route rate limits.
- Server-side model resolver enforcement.
- Provider usage recording.
- Conservative retry behavior.
- An operator kill switch or config cap for lesson generation if provider limits are exhausted.

## Implementation Steps

1. Add schema support for module lesson-generation status and task lesson-content payloads.
2. Add shared Zod schemas for generated lesson content.
3. Add a prompt builder specifically for module lesson content.
4. Add a parser/validator that requires exact task coverage.
5. Add a lesson-generation boundary that owns ownership checks, idempotency, model resolution, provider invocation, usage recording, quota reservation, and persistence.
6. Add a thin authenticated API endpoint for module lesson generation.
7. Extend module detail read projection to include lesson content and module content-generation status.
8. Replace placeholder lesson rendering with generated content rendering, plus missing/generating/failed states.
9. Add tests around parser, persistence, API, read projection, quota, and UI states.
10. Run targeted validation, then `pnpm test:changed` and `pnpm check:full`.

## Main Risks

1. Free provider capacity is not a business model.
   - Mitigation: lazy generation, caching, hard quotas, and kill switch.
2. Large module batch responses can become invalid.
   - Mitigation: strict task count caps already exist, output budgets, exact-coverage parser, retryable failure state.
3. Duplicate generation can happen from concurrent clicks.
   - Mitigation: lock the module row or use a compare-and-set transition from `not_generated`/`failed` to `generating`.
4. Lesson content can become unsafe or malformed.
   - Mitigation: structured JSON blocks, no HTML, schema validation, escaped rendering.
5. Tier rules can fork from existing AI model rules.
   - Mitigation: reuse the shared model resolver and provider factory.
6. Quota accounting can drift when provider calls fail.
   - Mitigation: reserve/compensate pattern like existing metered boundaries.

## Open Product Decisions

1. How much free lesson content is enough for MVP without inviting abuse?
2. Should free users be allowed to generate content for every module in all three active plans, or only a limited number of modules per month?
3. Should a failed generation retry consume quota after the first failure, or only after success?
4. Should starter continue to use free models initially, or should paid tiers immediately unlock paid model options once billing is live?

## Recommendation

Start with explicit user-triggered module-batch generation.

Auto-generation feels smoother, but it is also easier to abuse, harder to reason about, and more likely to burn free provider capacity on modules the user only glanced at. If the user has to click "Generate lessons", quota consumption is intentional. That matters while free-model capacity is the bottleneck.

The UX cannot feel like a wall, though. The missing-content state should explain that lesson content is generated once, cached after completion, and covers every task in the module. After the click, the user should see an immediate pending state and enough surrounding module context to stay oriented. Cost control wins by requiring intent; UX wins by making the wait explicit, bounded, and obviously productive.

The minimum credible MVP is:

- module-batch generation,
- persistent structured task lesson content,
- tiered module-generation quota,
- cached reads,
- retry on failure,
- no raw HTML,
- no upfront bulk generation.
