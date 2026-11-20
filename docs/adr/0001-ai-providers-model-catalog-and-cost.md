# ADR 0001: AI providers, model catalog and cost accounting

- Status: Accepted
- Date: 2026-11-20
- Source: moved here from inline code comments when comments were banned in `src/` (see the `delete-comment` skill). Each entry is the original comment text, grouped by the file it sat in.

## Context

Atlaris routes every generation through OpenRouter, resolves models per billing tier and operation from each tier's guardrail, and records cost per call. The rationale below was kept in code comments across `src/features/ai`. It covers why requests are shaped the way they are, why the catalog fails the way it does, and why cost is computed in one place.

## Decisions

### `src/features/ai/abort.ts`

- `function createAbortError` — Creates a standard DOMException for aborted operations. Use this instead of plain Error with name 'AbortError' so that instanceof DOMException and native AbortController behavior work correctly downstream.
- `function attachAbortListener` — Attaches a one-shot listener for the given AbortSignal's abort event. If the signal is already aborted, the listener is invoked synchronously and a no-op cleanup is returned. Otherwise, an "abort" event listener is attached, and a cleanup function is returned that removes that listener. Call the cleanup when the listener is no longer needed to avoid leaks. Works with both DOM and Node AbortSignal implementations (e.g. from AbortController, fetch, or Node's events). @param signal - The AbortSignal to listen to (DOM or Node). @param listener - Callback invoked when the signal is or becomes aborted. @returns A cleanup function that removes the attached "abort" listener. Safe to call multiple times; no-op if the signal was already aborted.

### `src/features/ai/ai-models.ts`

- `import` — The models each tier × operation offers: its tier's OpenRouter guardrail list (`model-catalog`) and/or the `openrouter/free` router, per `model-operation-policy.ts`. Catalog `tier` labels are not proof of zero cost. @module lib/ai/ai-models
- `readonly freeRouterFallback: boolean;` — The default is the free router only because the guardrail left no paid default.
- `logger.error` — Last resort: the code-owned free router, added to the list so the default stays among the models it is validated against. `resolveModelForTier` alerts once per generation that runs on it; lookups only log.
- `async function getDefaultModelForTier` — The default model for a subscription tier and generation operation: the code-owned default while the tier's guardrail lists it, otherwise the first listed model on the operation's grounded writer route, otherwise the free router.
- `async function resolveDefaultModelForTier` — {@link getDefaultModelForTier} plus whether that default is the free router only because the tier's guardrail left no paid default, and the {@link getModelsForTier} list it was resolved from.
- `function getFallbackModelsForTier` — Returns the ordered provider fallback route for a resolved primary model. Free never falls back to a paid model. Starter outline/regen never falls back to `openrouter/free`. A Starter lesson falls back to `openrouter/free` when its paid model fails; Free lessons already run on it. Pro keeps an empty provider fallback list.

### `src/features/ai/cost.ts`

- `import type` — Centralized AI cost calculation and output-token ceilings. This is the **single source of truth** for: 1. Deterministic cost computation from model pricing and token counts. 2. Output-token ceilings per model — enforced at the provider call boundary. All persistence, billing, and provider code should import from this module. Ceilings are model-specific and tier-independent: the same model always gets the same ceiling regardless of the user's subscription tier. Pricing and limits come from the synced guardrail catalog (`model-catalog`). @module features/ai/cost
- `const DEFAULT_OUTPUT_TOKEN_CEILING` — Default output-token ceiling applied to models that do not declare `maxOutputTokens` (e.g., the `openrouter/free` router or unknown models). Set conservatively to prevent runaway output spend while still allowing complete structured plan generation.
- `class UnknownModelError extends Error` — Thrown by {@link computeCostCents} when the model is missing from the pricing registry. Distinct error class so callers can decide whether to surface as a partial-usage record or hard-fail.
- `class ModelCatalogUnavailableError extends Error` — Thrown by {@link computeCostCents} when the catalog cannot be read, so callers can tell an outage apart from a model no guardrail lists.
- `async function lookUpPricedModel` — The catalog entry for `modelId`, `null` when it is unknown, or {@link ModelCatalogUnavailableError} when the catalog cannot be read (for example a jobs Worker call made outside `withDb`). The caller logs it.
- `async function computeCostCents` — Compute estimated cost in **USD cents** from model pricing and token counts. Throws {@link UnknownModelError} when the model is not in the catalog (unknown models must not silently waive charges) and {@link ModelCatalogUnavailableError} when the catalog cannot be read. Returns 0 when both counts are zero. Identical inputs and catalog pricing always produce identical output.
- `async function getOutputTokenCeiling` — Return the output-token ceiling for a given model. Uses the model's `maxOutputTokens` when defined; otherwise falls back to {@link DEFAULT_OUTPUT_TOKEN_CEILING}. The ceiling is model-specific and tier-independent — every user tier gets the same ceiling for the same model. Callers at the provider boundary pass this value as `maxTokens` to prevent unbounded output generation.

### `src/features/ai/grounded-generation-flag.ts`

- `async function isGroundedEnabled` — Whether `tier` runs grounded generation (the `grounded-generation` flag). Fail closed: an evaluation error means the current pipeline, so a Flagship outage degrades to ungrounded runs instead of failing or retrying plan and lesson generation. `src/flags.ts` logs the failure once per `FLAG_FAILURE_TTL_MS` window and serves it without a provider call.

### `src/features/ai/model-catalog/catalog-state.ts`

- `const warnedNoKeyTiers` — Logged once per process: the jobs Worker never has tier keys.
- `const warnedSeedPricingModels` — Logged once per process per model priced from a never-synced seed row.
- `const catalogSyncGeneration` — Bumped by each sync, so a lookup that raced it is not memoized.

### `src/features/ai/model-catalog/catalog.ts`

- `import type` — Each tier's model list and metadata, synced from its OpenRouter guardrail into `openrouter_tier_models` (DEV-174). A guardrail change reaches users on the next refresh, with no code change or deploy. Refresh-on-read: a read whose rows are older than {@link MODEL_CATALOG_TTL_MS} (or missing) syncs that tier first, when this runtime has the tier's own key. The jobs Worker has no tier keys, so it only reads what the app synced (or the migration seeded).
- `const FREE_ROUTER_MODEL: AvailableModel` — `openrouter/free` is a router, not a model, so no guardrail lists it. It stays code-owned: free, with no output limit of its own.
- `function isHostedAppRuntime` — The Next app deployed on Vercel (production or preview), which should have every tier key. Local dev may lack them, and the jobs Worker never has them.
- `function alertIfSyncKeepsFailing` — Alerts once per run of failed syncs, when the run outlasts {@link MODEL_CATALOG_TTL_MS} (the tier's prices are stale by then), rather than on every retry. A successful sync ends the run.
- `async function refreshTier` — One sync per tier per process at a time; backs off after a failure. Only the app syncs (the Worker has no tier keys), so a shared sync never runs on another Workflow step's database pool.
- `function endFailureRunIfSyncedElsewhere` — Ends this process's run of failed syncs when the rows show another instance synced the tier after the run began, so a later transient failure here starts a new run instead of alerting on the old one.
- `async function getTierModels` — `tier`'s guardrail models, refreshed first when stale. Concurrent reads of a tier share one refresh, but each runs its own query: in the jobs Worker the database is bound per Workflow step, so a shared query could run on another step's pool.
- `async function getCatalogModel` — Pricing and limits for `modelId` from any tier's synced list, or `null` when no guardrail lists it. Throws when the catalog cannot be read.

### `src/features/ai/model-catalog/guardrail-models.ts`

- `function perMillion` — USD per token → USD per million tokens, without float noise (`0.1`, not `0.09999…`).
- `function splitDisplayName` — `"Anthropic: Claude Haiku 5.5"` → provider `Anthropic`, name `Claude Haiku 5.5`.
- `function parseGuardrailModels` — Parses a `/models/user` body. Skips and logs a model it cannot price or parse (a variable `-1` price, a missing field), so one entry cannot freeze the tier's list. Throws when the body is malformed or no model is valid, so a sync never replaces good rows with an empty list. Long-prompt `pricing.overrides` are ignored.

### `src/features/ai/model-catalog/store.ts`

- `import type` — `openrouter_tier_models` reads and writes. The table is global, server-owned and deny-all under RLS, so every access uses the service-role client.
- `async function replaceTierModels` — Replaces `tier`'s rows with `models` in one transaction. A per-tier advisory lock serializes concurrent syncs; readers see the old rows or the new ones.

### `src/features/ai/model-operation-policy.ts`

- `const GROUNDED_OPERATIONS` — Grounded generation (JCS-154). A separate policy so the standard (non-grounded) one above, and the pipeline it drives, stay unchanged while the `grounded-generation` flag is off. Model IDs are OpenRouter slugs sent per request; presets hold only prompts and stay model-agnostic.
- `type ResearchLimits` — Per-request web search caps (`max_results`, `max_total_results`). A direct Parallel search (DEV-171) sends one request for `maxTotalResults` results and caps their excerpts at `maxExcerptChars` in total.
- `researchDirect: 'atlaris-grounded-research-direct',` — Writes the brief from search results we pass in (DEV-171).
- `function getGroundedModelRoute` — Models to send for one grounded request, primary first. A Pro pick leads when it is in the role's catalog; otherwise it is ignored. `null` when the tier does not run the operation.

### `src/features/ai/model-preferences.ts`

- `async function getProOnlyModelsForTier` — Models Starter sees in its picker but cannot pick (Settings shows them disabled with a Pro plan badge): its picker-hidden guardrail models plus Pro guardrail models missing from the Starter guardrail, without runtime-only routers. Empty for Free, Pro, lessons and operations that offer no guardrail models. Validation still rejects these models (`tier_denied`).
- `function savedModelIdForOperation` — Which saved column feeds an operation. Starter/Free regeneration reuse the single outline slot; Pro regeneration and lesson slots are independent. Starter/Free lessons are code-owned, so a lesson pick saved on Pro does not carry over after a downgrade.
- `function resolveOverrideOrSavedModelId` — Prefer an explicit override when present; otherwise the saved slot for this tier × operation. Does not validate catalog membership — callers pass the result to `resolveModelForTier` / `processGenerationAttempt`.
- `async function resolveEffectivePreference` — Runtime model for the current tier × operation. Never writes. Out-of-tier or empty saved values fall back to the operation default.
- `const GROUNDED_PICK_ROLES` — Grounded generation (JCS-157). Pro users pick the writer, verifier and advisor models from the role catalogs in `model-operation-policy.ts`. These picks live in their own slots so the standard (non-grounded) ones above stay unchanged.
- `function resolveGroundedModelPick` — The saved pick to lead the `role` route, or `null` for the tier's code-owned models. A downgraded user's pick is ignored here but stays stored, so it applies again if they return to Pro. Never writes.
- `function resolveGroundedWriterModelId` — The writer model to lead a grounded call (JCS-169): an explicit per-request override in the tier's writer catalog, else the saved Pro writer pick. An off-catalog override falls through rather than masking the pick. The standard slots above never apply to grounded runs. `null` runs the tier's code-owned writers.

### `src/features/ai/model-resolver.ts`

- `import type` — Unified model/tier resolution for all generation entry points. Every route that kicks off plan generation (stream, retry, etc.) MUST use `resolveModelForTier` so tier-gating logic lives in exactly one place.
- `freeRouterFallback?: true;` — The operation default ran on the free router because the tier's guardrail left no paid default.
- `async function validateModelForTier` — Validates whether a requested model is allowed for a tier × operation: `tier_denied` when another tier's guardrail lists it, `invalid_model` when none does. Throws only when the default check or catalog read fails. Pass `allowedModels` when the caller already resolved the tier's models.
- `return providerGetter` — Always use the model-specific provider factory so default-model fallback cannot be silently redirected by aiEnv.defaultModel.
- `async function resolveModelForTier` — Resolves the generation provider and model for a given user tier and optional model override. All generation entry points (stream, retry, default) MUST use this function. @param userTier - The user's subscription tier @param requestedModel - Optional model ID from request. Pass undefined when param absent (not_specified fallback). Null/empty string means invalid_model fallback. @param operation - Generation operation whose catalog and default apply. @param providerGetter - Optional provider getter for dependency injection in tests. Defaults to getGenerationProviderWithModel. @param requestLogger - Optional logger injection for tests/callers that need log isolation. @returns ModelResolution with the resolved provider and metadata

### `src/features/ai/openrouter-cost-contract.ts`

- `cost?: number | null;` — OpenRouter extension field on `usage`: USD float, not credits.

### `src/features/ai/parser.ts`

- `if` — Re-throw abort so callers can distinguish user cancellation from parse failures.

### `src/features/ai/providers/factory.ts`

- `function shouldUseMock` — Returns true when mock providers should be used. Resolution order: 1. `AI_PROVIDER=mock` → mock 2. `AI_PROVIDER=router` → router (real provider) 3. `AI_PROVIDER` unset in test or development → mock 4. `AI_PROVIDER` unset in production → router (real provider) Any other `AI_PROVIDER` value throws at env-parse time (see ai.ts), so we only see the two legal explicit values here.
- `function getGenerationProviderWithModel` — Creates a generation provider configured with a specific model. Used when a user has selected a preferred model or when explicitly specifying a model. The `tier` argument is a routing hint, not an access-control gate; callers should already have validated the model/tier pair through `resolveModelForTier`. @param modelId - OpenRouter model ID (e.g., 'openai/gpt-6-luna') @returns An instance implementing `AiPlanGenerationProvider`

### `src/features/ai/providers/mock.ts`

- `const VARIANCE_THRESHOLD_MS` — Variance is only applied when delay >= 1000ms to ensure fast test runs are deterministic. Below this threshold, exact delay is used with no random variance.

### `src/features/ai/providers/openrouter-grounded-response.ts`

- `function normalizeGroundedUsage` — Reads the wire `usage` object. Search counts come from `server_tool_use_details`; the documented `server_tool_use` is read only as a fallback because responses omit it in practice.

### `src/features/ai/providers/openrouter-json.ts`

- `unclosedAt?: number;` — Opening brace that never closes (truncated output).
- `return` — Every later brace is nested inside this one, so parsing one would return a fragment of the real object.
- `skipped.push` — Not JSON (prose braces); skip past it rather than into it.
- `function extractFirstJsonObject` — Takes the first balanced JSON object from model output. Models that ignore `response_format` wrap JSON in code fences and prose, so a fenced block wins unless it sits inside a balanced object (fenced code in a string value, even when that object is malformed) or after a brace that never closes.

### `src/features/ai/providers/openrouter-response.ts`

- `usageObjectPresent: boolean;` — True when `event.usage` is a plain object record; arrays are excluded because malformed list payloads should not become authoritative for streaming cost.

### `src/features/ai/providers/openrouter-server-tools.ts`

- `type OpenRouterWebSearchEngine` — OpenRouter server tools (run by OpenRouter, not by us) and their wire shape. Both are billed per use, so a request carrying either must not be retried by the AI Gateway.

### `src/features/ai/providers/openrouter.ts`

- `tier?: SubscriptionTier;` — Picks `OPENROUTER_API_KEY_<TIER>` when no `apiKey` is given. Grounded stages pass it; the standard (non-grounded) pipeline does not, so it keeps one key.
- `logger.warn` — A shorter fallback chain beats a request that cannot run at all.
- `function requirePresetSlug` — System prompts live only in OpenRouter presets, so a request without a valid preset slug must not be sent.
- `function resolveAiGatewayConfig` — AI Gateway headers go only to the gateway host, so the Cloudflare token never reaches OpenRouter when `OPENROUTER_BASE_URL` is unset or points elsewhere.
- `const AI_GATEWAY_MAX_ATTEMPTS` — Requests with billed server tools get a single attempt: a gateway retry would rerun and re-bill the searches. The workflow step retries those.
- `'cf-aig-skip-cache': 'true',` — Regenerations resend identical requests and must get a fresh answer.
- `'cf-aig-max-attempts': String` — One quick retry, overriding the dashboard. Streamed calls fail before the stream starts (429, 5xx), so a retry cannot repeat a running generation. No cf-aig-request-timeout: a timeout retry could.
- `type OpenRouterPromptPart` — One user prompt part. `cache` sets an explicit cache breakpoint on it, for the stable prefix (brief, module outline) that repeats across calls. A breakpoint caches everything before it, the preset's system prompt included, so cached parts belong first.
- `promptCacheKey?: string;` — Sticky routing key, so calls sharing a cached prefix hit the same cache.
- `const MAX_CACHE_BREAKPOINTS` — Anthropic allows four explicit breakpoints; Gemini uses only the last.
- `async function* mapStreamTimeout` — Maps a body read that failed because the request timed out.
- `const timeoutSignal` — The timeout covers reading the stream too, not only the first byte.

### `src/features/ai/providers/parallel-search.ts`

- `const PARALLEL_SEARCH_URL` — Parallel Search API (DEV-171): one request with our own key, called before the research model runs. Docs: https://docs.parallel.ai/api-reference/search/search
- `function parallelSearchUsage` — One search as a usage record: no tokens, its cost from the price table. Recorded on its own when no model call followed the search (DEV-185).
- `readonly results: readonly [ParallelSearchResult, ...ParallelSearchRes` — The usable results, by decreasing relevance; never empty.
- `const parallelSearchResponseSchema` — Each result is checked on its own, so a malformed one drops only itself.
- `if` — Excerpts are enabled by default; the brief needs them, so a run without any is worth noticing (the schema's default would otherwise hide it).
- `async function searchParallel` — Runs one search. Throws a plain `Error` without `PARALLEL_API_KEY` and a `ProviderError` on an HTTP failure, timeout, malformed body or zero results; the research step owns retries. A completed request is billed whatever its body, so an error thrown after a 2xx carries the search's usage (`billedUsageOf`). A caller's abort is rethrown as is.

### `src/features/ai/providers/router.ts`

- `function getStatusCode` — Extracts HTTP status from arbitrary SDK/fetch errors via safe property narrowing. Intentional exception to the "no unknown/any" guideline: the parameter is typed as `unknown` so callers must pass through untyped errors (e.g. from fetch or OpenRouter SDK) and we narrow safely using explicit checks for `status`, `statusCode`, and `response.status`. If the linter flags `unknown` here, add a targeted oxlint disable for that rule and reference getStatusCode in the comment so future readers know it is intentional.

### `src/features/ai/sanitize-prompt-input.ts`

- `function sanitizeUserInput` — Sanitizes user-provided text for prompt assembly to reduce prompt-injection risk. Collapses excessive newlines and neutralizes delimiter sequences.

### `src/features/ai/timeout.ts`

- `timedOut` — Node.js executes this callback on the same event loop thread; concurrent writes would require worker threads which we do not spawn here. Should that change, this mutation must be revisited to use an atomic primitive.

### `src/features/ai/types/model.types.ts`

- `type ModelTier` — Catalog access label (`free` vs `pro`). This is not proof of zero cost and is not the operation allowlist — see `model-operation-policy.ts`.
- `id: string;` — OpenRouter model ID (e.g., 'google/gemini-1.5-flash')
- `name: string;` — Display name for UI (e.g., 'Gemini 1.5 Flash')
- `provider: string;` — Provider name (e.g., 'Google', 'OpenAI', 'Anthropic')

### `src/features/ai/usage.ts`

- `import type` — Canonical AI usage normalization. This module bridges raw provider metadata (ProviderMetadata) to the canonical usage shape (CanonicalAIUsage). All persistence and billing code should consume CanonicalAIUsage — never raw metadata fields. Cost computation is delegated to `@/features/ai/cost` — the single source of truth for pricing and output-token ceilings.
- `async function normalizeToCanonicalUsage` — Strictly normalize provider metadata into a CanonicalAIUsage. Throws {@link IncompleteUsageError} if any required field (provider, model, inputTokens, outputTokens) is missing or undefined. The error carries a best-effort `partialUsage` so callers can still record data after logging.
- `const isPartial` — Mock providers and synthetic flows legitimately call this with models that are not in the synced catalog; record cost as 0 in that case but log it explicitly so the silent path stops being invisible. Any other error from computeCostCents (invalid token counts, registry bug) must propagate.
- `async function safeNormalizeUsage` — Normalize provider metadata to canonical usage, logging an explicit error (never silently defaulting) when data is incomplete. Always returns a {@link CanonicalAIUsage} so downstream recording can proceed, but missing fields are surfaced via structured logs and Sentry.
- `function sumUsages` — One usage record for several calls: token and cost totals, model and provider of the first. When any call has an OpenRouter-reported cost, the provider total adds each call's reported cost, or its catalog estimate when it has none, so the row costs what the calls cost one by one. The estimate leaves out web search, advisor and cache-write charges, so letting one call without a reported cost turn the whole row into an estimate undercounts.
- `async function completeUsageOrNull` — Complete usage for a finished call, or `null` when its usage never fully arrived (for example a stream cut off before the closing usage chunk).
- `async function withBilledUsage` — Runs `use` on a call's output. When it throws, the error carries the call's usage (read it with {@link billedUsageOf}), because OpenRouter bills a call whose output is unreadable or rejected. The step that made the call records it, since a step's thrown result, and with it the usage, is not kept.

### `src/shared/constants/ai-models.ts`

- `const AI_DEFAULT_MODEL` — OpenRouter's free-models router. `/models/user` never lists it, so the operation policy and the catalog keep it as a code-owned entry.

### `src/shared/types/ai-provider.types.ts`

- `type DbEnumsModule` — SkillLevel / LearningStyle derived from enums here (not from db.types) to avoid circular: db.types → attempts.types → this file.
- `freeRouterFallback?: true;` — A paid tier's generation ran on the free router because its guardrail left no paid default (DEV-174). Persisted on the attempt for the plan page notice.

### `src/shared/types/ai-usage.types.ts`

- (file or block level) — Canonical AI usage accounting contract. This is the single source of truth for AI usage data. All providers normalize their responses into this shape. All persistence and billing code consumes only this type. Missing or incomplete usage data must raise an explicit error/alert — never silently default to zero.
- `class IncompleteUsageError extends Error` — Thrown when provider metadata is missing required usage fields. Carries partial usage so callers can still record best-effort data after logging the error.

### `src/shared/types/generation-purpose.ts`

- `function resolveWorkflowGenerationPurpose` — Resolves `generationPurpose` on a serialized reservation. The field is optional in workflow payloads, so in-flight instances created before it was added still resolve. Missing resolves to `fallback`; an explicit value is parsed as any valid GenerationPurpose. Workflow payload classification must use the trusted boundary resolvers, which reject an explicit purpose that does not match that workflow. Do not use this to infer purpose from usageKind, routes, or metadata.

## Consequences

The code no longer carries this rationale inline. A change that would alter one of the behaviors above should update this ADR in the same pull request, and a new non-obvious decision belongs in an ADR, not in a comment.
