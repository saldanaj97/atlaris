# AI Module

**Parent:** [Root AGENTS.md](../../../AGENTS.md)

## Overview

Provider-agnostic AI generation with streaming, timeout handling, and failure classification.  
Default: OpenRouter. Tests: MockGenerationProvider.

## Structure

```
ai/
├── abort.ts               # Abort listener helpers (createAbortError, attachAbortListener)
├── ai-models.ts           # Available model definitions + tier gating (client-safe)
├── classification.ts      # Error → FailureClassification mapping
├── constants.ts           # Shared generation constants (caps, limits, backoff)
├── failure-presentation.ts # Classification → user-facing message/code mapping
├── failures.ts            # Retryability helpers (isRetryableClassification)
├── generation-policy.ts   # Rate-limit windows, per-plan attempt cap (env-overridable)
├── model-resolver.ts      # Tier-aware model validation + provider instantiation
├── orchestrator.ts        # runGenerationAttempt() — main entry point
├── pacing.ts              # Trim modules to fit user's available time
├── parser.ts              # Stream parsing → structured ParsedModule[]
├── prompts.ts             # Prompt assembly + input sanitization
├── timeout.ts             # Adaptive timeout controller + retry backoff config
├── streaming/
│   ├── events.ts          # SSE stream wrapper + cancel propagation
│   ├── error-sanitizer.ts # Client-safe SSE error mapping
│   ├── schema.ts          # Zod schemas for streaming event validation
│   └── utils.ts           # Stream conversion helpers (toStream, readableStreamToAsyncIterable)
├── providers/
│   ├── errors.ts          # ProviderError class hierarchy
│   ├── factory.ts         # Provider selection (mock vs real, model override)
│   ├── router.ts          # Provider routing + transient retry policy (p-retry)
│   ├── openrouter.ts      # OpenRouter transport adapter (streaming)
│   └── mock.ts            # Test provider (deterministic, configurable delay/failure)
└── types/
    ├── model.types.ts       # AvailableModel, ModelTier, SubscriptionTier
    ├── orchestrator.types.ts # GenerationAttemptContext, RunGenerationOptions, GenerationResult
    ├── parser.types.ts      # ParsedModule, ParsedTask, ParserCallbacks
    ├── provider.types.ts    # AiPlanGenerationProvider, GenerationInput, ProviderMetadata
    ├── streaming.types.ts   # SSE event type unions (PlanStartEvent, ErrorEvent, etc.)
    └── timeout.types.ts     # AdaptiveTimeoutConfig
```

## Provider Pattern

All providers implement `AiPlanGenerationProvider` (from `types/provider.types.ts`):

```typescript
type AiPlanGenerationProvider = {
  generate(
    input: GenerationInput,
    options?: GenerationOptions // { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<ProviderGenerateResult>; // { stream: ReadableStream<string>; metadata: ProviderMetadata }
};
```

Error classes in `providers/errors.ts`: `ProviderError`, `ProviderRateLimitError`, `ProviderTimeoutError`, `ProviderInvalidResponseError`.

## Usage

```typescript
import { runGenerationAttempt } from '@/lib/ai/orchestrator';

const result = await runGenerationAttempt(
  { planId, userId, input: { topic, skillLevel, weeklyHours, ... } },
  { dbClient, provider, timeoutConfig, signal }
);

if (result.status === 'success') {
  // result.modules, result.rawText, result.metadata, result.attempt
} else {
  // result.classification — see Failure Classification table
  // result.error, result.attempt
}
```

`RunGenerationOptions.dbClient` is **required** — pass the request-scoped `getDb()` client.

## Provider Selection

```typescript
// Default provider (respects env config):
import { getGenerationProvider } from '@/lib/ai/providers/factory';
const provider = getGenerationProvider();

// Specific model (tier-gated routes should use model-resolver instead):
import { getGenerationProviderWithModel } from '@/lib/ai/providers/factory';
const provider = getGenerationProviderWithModel(
  'google/gemini-2.0-flash-exp:free'
);
```

### Model Resolution (Tier-Gated)

Routes that accept a user-selected model **must** use `model-resolver.ts`:

```typescript
import { resolveModelForTier } from '@/lib/ai/model-resolver';

const { modelId, provider, fallback } = resolveModelForTier(
  userTier,
  requestedModel
);
```

This validates the model exists and is allowed for the user's subscription tier, falling back to the tier default when invalid.

### Environment Controls

- `AI_PROVIDER=mock` → Forces MockGenerationProvider
- `AI_USE_MOCK=false` → Forces real provider even in test/dev
- `MOCK_GENERATION_SEED=123` → Deterministic mock output
- Development mode defaults to mock when no explicit `AI_PROVIDER` is set

## Timeout Strategy

Orchestrator timeout defaults come from `aiTimeoutEnv` (env-configurable) and can be overridden per call:

```typescript
const timeout = createAdaptiveTimeout({
  baseMs: 30_000, // Initial deadline
  extensionMs: 15_000, // Extra budget granted on first module
  extensionThresholdMs: 25_000, // Must see first module before this to extend
});

// Orchestrator wires: onFirstModuleDetected → timeout.notifyFirstModule()
```

Retry backoff config (`getRetryBackoffConfig()`) is sourced from `constants.ts` (`RETRY_BACKOFF_MS`).

## Stream Error Contract

`/plans/stream` emits sanitized terminal `error` events via `failure-presentation.ts`:

```typescript
{
  code: string;         // e.g. 'GENERATION_TIMEOUT', 'RATE_LIMITED', 'ATTEMPTS_EXHAUSTED'
  message: string;      // User-facing message
  classification: string;
  retryable: boolean;
  requestId?: string;
}
```

Streaming event types and Zod schemas live in `types/streaming.types.ts` and `streaming/schema.ts`.

## Failure Classification

| Classification   | Cause                              | Retryable          |
| ---------------- | ---------------------------------- | ------------------ |
| `timeout`        | Provider too slow                  | Yes                |
| `rate_limit`     | Provider throttled / concurrent    | Yes (with backoff) |
| `provider_error` | API error                          | Yes                |
| `validation`     | Bad AI output (invalid JSON/shape) | No                 |
| `capped`         | Per-plan attempt cap reached       | No                 |
| `conflict`       | Concurrent generation in progress  | Yes                |

Attempt cap is configurable via `ATTEMPT_CAP` env var (default: 3, from `generation-policy.ts`).

## Testing

```typescript
const provider = new MockGenerationProvider({
  deterministicSeed: 42,
  delayMs: 0, // Optional: control chunk delay
  failureRate: 0, // Optional: simulate random failures
});
await runGenerationAttempt(context, { provider, dbClient });
```

## Anti-Patterns

- Calling OpenRouter directly (use provider abstraction)
- Ignoring `signal` parameter (breaks cancellation)
- Hardcoding timeout values (use `createAdaptiveTimeout`)
- Returning raw provider/internal error messages to SSE clients
- Not handling all failure classifications
- Bypassing `model-resolver.ts` for tier-gated model selection
