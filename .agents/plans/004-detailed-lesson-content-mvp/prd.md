# Detailed Lesson Content MVP PRD

Date: 2026-05-15
GitHub issue: https://github.com/saldanaj97/atlaris/issues/328

## Problem Statement

Users can ask Atlaris for a learning topic and receive a structured plan with modules and tasks. The current module detail page treats each task as a lesson, but the lesson body is generated placeholder text. That means the product stops exactly where the user expects the real value to begin.

The live code does not have subtasks. It has modules, tasks, task progress, resources, and a placeholder lesson renderer. The MVP gap is not "add subtasks"; it is "turn each task into a real generated lesson while keeping the existing module/task model."

The business constraint is severe: the product currently depends on free models and has no budget. Generating every lesson body during initial plan creation would burn through provider request limits, increase latency, and create fragile failures before users even know which lessons they need. That is not a serious MVP path.

## Solution

Generate detailed lesson content lazily, cache it permanently, and gate every generation through the existing tier/model/usage boundaries.

For the MVP, when a user opens an unlocked module whose lesson content is missing, Atlaris should show a clear "Generate lessons" action. When the user clicks it, Atlaris should generate the lesson bodies for that module in one provider request, validate the structured output, persist it on the existing owned module/task records, and render it in the existing lesson accordion. Existing placeholder text should remain only as an empty/loading/fallback state, not as the default learning experience.

This is intentionally not auto-generation on page open. Cost is the hard constraint: the product should not spend scarce free-provider requests just because a user peeked at a module. UX is still a hard constraint: the page should make the action obvious, explain that generation happens once for the full module, and show an immediate pending state so the user does not assume the product is broken.

The content should be concise but useful: objective, explanation, worked example or scenario, practice activity, key takeaways, and completion criteria. The goal is not to write a textbook. The goal is to give the user enough instruction to complete the task and keep moving.

## User Stories

1. As a learner, I want each task to contain actual lesson content, so that I can learn inside Atlaris instead of receiving a skeleton checklist.
2. As a learner, I want lesson content to appear only for unlocked modules, so that the guided sequence still matters.
3. As a learner, I want generated lesson content to stay available after refresh, so that I do not wait or spend quota twice.
4. As a learner, I want a clear loading state when lesson content is being generated, so that I understand why content is not visible yet.
5. As a learner, I want a clear failure state with retry when generation fails, so that a transient provider issue does not strand the module.
6. As a learner, I want lesson content to match my original topic, skill level, learning style, and task title, so that it feels personalized instead of generic.
7. As a learner, I want lesson content to be focused and not bloated, so that I can finish lessons in the estimated time.
8. As a learner, I want resources to remain visible alongside generated content, so that external materials still supplement the lesson.
9. As a learner, I want task progress controls to remain in the lesson, so that I can mark completion after reading and practicing.
10. As a free user, I want access to useful lesson content within fair limits, so that the free plan is still a real MVP experience.
11. As a paid user later, I want higher generation limits and better model options, so that upgrading can improve depth without a rewrite.
12. As a product operator, I want generation to be lazy and cached, so that users do not consume provider capacity for modules they never open.
13. As a product operator, I want per-tier limits for lesson generation, so that a small number of users cannot consume all free-model capacity.
14. As a product operator, I want provider usage recorded, so that model behavior and cost exposure are visible.
15. As a product operator, I want a kill switch or conservative limit path, so that the product can stop generating content if free-model availability degrades.
16. As a developer, I want lesson generation to reuse the existing model resolver, provider factory, and request boundary patterns, so that tier logic does not fork.
17. As a developer, I want structured lesson output, so that the UI can render safe content blocks without trusting raw HTML.
18. As a developer, I want idempotent generation, so that repeated clicks or concurrent requests do not duplicate provider calls.
19. As a developer, I want persistence to inherit existing ownership policies when possible, so that the feature does not create a new RLS surface unnecessarily.
20. As a developer, I want tests around the generation contract, persistence, quota denial, and read projection, so that this does not become another demo-only surface.

## Implementation Decisions

- The product will keep the existing module/task model. Tasks are the lesson units for this MVP.
- The default MVP generation mode will be module-batch lazy generation: one request generates lesson content for all tasks in one unlocked module.
- Module lesson generation starts from an explicit user action, not automatically on first module open.
- Initial plan creation will not generate long-form lesson content.
- Generated content will be cached and reused. A successful generation should not be repeated unless a future explicit regenerate action is added.
- Lesson content will use a structured JSON shape rather than raw HTML. The renderer should support a small safe block set such as heading, paragraph, example, practice, takeaways, and completion criteria.
- Task descriptions remain short summaries. Detailed lesson content is a separate long-form field.
- Module-level generation status should prevent duplicate in-flight work and give the UI a clear pending, ready, and failed state.
- Tier/model gating must use the same model-resolution path as plan generation.
- Free and starter users should remain limited to free-access model choices until the product intentionally changes paid-tier behavior.
- Lesson generation needs its own product usage meter rather than silently reusing regeneration quota.
- Provider usage should still be recorded through the existing AI usage recording path or a small extension of that path.
- Route handlers should stay thin: authenticate, rate-limit, validate route params, call the lesson-generation boundary, and return a typed response.
- The feature should fail closed. If generation is denied, invalid, or unavailable, the UI should say so instead of silently showing fake content.
- The existing placeholder renderer should be removed from the happy path after real content is wired.

## Testing Decisions

- Good tests should verify externally observable behavior: owned users can generate/read their own lesson content, unauthorized users cannot, cached content is reused, quota denial returns a clear response, and invalid provider output fails without corrupting persisted content.
- Test the prompt/output parser with valid content, malformed JSON, missing task coverage, extra task IDs, oversized text, and unsupported block types.
- Test the persistence boundary with owned plan/module/task rows, concurrent generation attempts, cached-ready no-op, failed generation status, and retry after failure.
- Test the read projection so module detail exposes generated content only in the intended task DTO shape.
- Test the API contract for success, cached success, generation in progress, quota denied, not found, unauthorized, and provider failure.
- Test the UI path at the component level: missing content shows generate/loading state, ready content renders blocks, failed content shows retry, locked lessons do not trigger generation.
- Use prior art from existing plan generation, module detail read-model, task progress, usage metrics, and provider parser tests.
- Final implementation validation must include targeted tests for the touched slice, then `pnpm test:changed` and `pnpm check:full`.

## Out of Scope

- No subtask data model.
- No full-course textbook generation.
- No generating every lesson during initial plan creation.
- No paid-provider rollout for free users.
- No editing lesson content by users in the MVP.
- No regeneration UX beyond retrying a failed missing-content generation.
- No search/retrieval pipeline for external resources.
- No assessment engine, quiz grading, certificates, or spaced repetition.
- No public sharing of generated lesson content.

## Further Notes

OpenRouter's current free-model limits make aggressive generation a bad product decision. Free model variants are limited by requests per minute and daily request caps, and the free router is explicitly positioned for low-volume use. The MVP should therefore optimize for fewer requests, caching, and hard product limits.

The hard tradeoff: per-task generation is simpler and smaller per request, but it can turn one plan into dozens of provider requests. Module-batch generation is slightly more complex, but it keeps the request count low enough to survive early usage on a free-model strategy. Choose the path that respects the actual constraint.
