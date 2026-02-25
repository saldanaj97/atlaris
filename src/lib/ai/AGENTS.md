# AI Module

**Parent:** [Root AGENTS.md](../../../AGENTS.md)

## Overview

Provider-agnostic AI generation with streaming, timeout handling, and failure classification.  
Default: OpenRouter. Tests: MockGenerationProvider.

## Structure

```
ai/
├── abort.ts             # Abort listener helpers
├── provider.ts          # Backward-compat shim + provider errors
├── provider-factory.ts  # Provider selection logic
├── orchestrator.ts      # runGenerationAttempt() - main entry
├── parser.ts            # Stream parsing -> structured modules
├── pacing.ts            # Trim modules to fit user's time
├── schema.ts            # Legacy schema helpers (base provider adapters/tests)
├── classification.ts    # Failure classification
├── timeout.ts           # Adaptive timeout + retry backoff config
├── streaming/
│   ├── events.ts        # SSE stream wrapper + cancel propagation
│   ├── error-sanitizer.ts # Client-safe SSE error mapping
│   └── types.ts         # Stream event contracts
├── providers/
│   ├── router.ts        # Provider routing + transient retry policy
│   ├── openrouter.ts    # OpenRouter transport adapter (streaming)
│   └── mock.ts          # Test provider (deterministic)
└── types/
    ├── provider.types.ts # Canonical provider types
    └── model.types.ts
```

## Provider Pattern

All providers implement `AiPlanGenerationProvider`:

```typescript
interface AiPlanGenerationProvider {
  generate(
    input: GenerationInput,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<{ stream: ReadableStream<string>; metadata: ProviderMetadata }>;
}
```

## Usage

```typescript
import { runGenerationAttempt } from '@/lib/ai/orchestrator';

const result = await runGenerationAttempt(
  { planId, userId, input: { topic, skillLevel, weeklyHours, ... } },
  { provider, timeoutConfig, signal, dbClient }
);

if (result.status === 'success') {
  // result.modules - parsed learning modules
} else {
  // result.classification - 'timeout' | 'rate_limit' | 'provider_error' | 'capped'
}
```

## Provider Selection

```typescript
// Default provider (respects env config):
import { getGenerationProvider } from '@/lib/ai/provider-factory';
const provider = getGenerationProvider();

// Specific model:
import { getGenerationProviderWithModel } from '@/lib/ai/provider-factory';
const provider = getGenerationProviderWithModel(
  'google/gemini-2.0-flash-exp:free'
);
```

Environment controls:

- `AI_PROVIDER=mock` → MockGenerationProvider
- `AI_USE_MOCK=false` → Force real provider in tests
- `MOCK_GENERATION_SEED=123` → Deterministic mock output

## Timeout Strategy

Orchestrator timeout defaults come from `aiTimeoutEnv` and can be overridden per call:

```typescript
const timeout = createAdaptiveTimeout({
  baseMs: 30_000,
  extensionMs: 15_000,
  extensionThresholdMs: 25_000,
});

// In orchestrator:
onFirstModuleDetected: () => timeout.notifyFirstModule();
```

The provider call always receives an explicit timeout budget from orchestrator (`timeoutMs: baseMs`).

## Stream Error Contract

`/plans/stream` emits sanitized terminal `error` events with stable fields:

```typescript
{
  code: string,
  message: string,
  classification: string,
  retryable: boolean,
  requestId?: string,
}
```

Routes should emit this terminal event and close gracefully for expected generation failures.

## Failure Classification

| Classification   | Cause                    | Retryable          |
| ---------------- | ------------------------ | ------------------ |
| `timeout`        | Provider too slow        | Yes                |
| `rate_limit`     | Provider throttled       | Yes (with backoff) |
| `provider_error` | API error                | Maybe              |
| `validation`     | Bad AI output            | No                 |
| `capped`         | Max attempts (3) reached | No                 |

## Testing

```typescript
// Mock provider with deterministic output:
const provider = new MockGenerationProvider({ deterministicSeed: 42 });

// Test captures input sent to provider (when appEnv.isTest):
globalThis.__capturedInputs = [];
await runGenerationAttempt(...);
expect(globalThis.__capturedInputs[0].input.topic).toBe('TypeScript');
// Capture is performed by captureForTesting in src/lib/ai/capture-for-testing.ts
```

## Anti-Patterns

- Calling OpenRouter directly (use provider abstraction)
- Ignoring `signal` parameter (breaks cancellation)
- Hardcoding timeout values (use `createAdaptiveTimeout`)
- Returning raw provider/internal error messages to SSE clients
- Not handling all failure classifications
