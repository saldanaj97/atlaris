# AI Module

**Parent:** [Root AGENTS.md](../../../AGENTS.md)

## Overview

Provider-agnostic AI generation with streaming, timeout handling, and failure classification.  
Default: OpenRouter. Tests: MockGenerationProvider.

## Structure

```
ai/
├── provider-factory.ts  # Provider selection logic
├── orchestrator.ts      # runGenerationAttempt() - main entry
├── parser.ts            # Stream parsing → structured modules
├── pacing.ts            # Trim modules to fit user's time
├── schema.ts            # Zod schemas for AI output
├── classification.ts    # Failure classification
├── timeout.ts           # Adaptive timeout with extension
├── providers/
│   ├── base.ts          # AiPlanGenerationProvider interface
│   ├── router.ts        # OpenRouter implementation
│   └── mock.ts          # Test provider (deterministic)
└── types/
    ├── provider.types.ts
    └── model.types.ts
```

## Provider Pattern

All providers implement `AiPlanGenerationProvider`:

```typescript
interface AiPlanGenerationProvider {
  generate(
    input: GenerationInput,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<{ stream: ReadableStream; metadata: ProviderMetadata }>;
}
```

## Usage

```typescript
import { runGenerationAttempt } from '@/lib/ai/orchestrator';

const result = await runGenerationAttempt(
  { planId, userId, input: { topic, skillLevel, weeklyHours, ... } },
  { provider, timeoutConfig, signal }
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

Adaptive timeout with extension on first module detection:

```typescript
const timeout = createAdaptiveTimeout({
  baseMs: 15_000, // Initial timeout
  extensionMs: 10_000, // Added when first module detected
});

// In orchestrator:
onFirstModuleDetected: () => timeout.notifyFirstModule();
```

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

// Test captures input sent to provider:
globalThis.__capturedInputs = [];
await runGenerationAttempt(...);
expect(globalThis.__capturedInputs[0].input.topic).toBe('TypeScript');
```

## Anti-Patterns

- Calling OpenRouter directly (use provider abstraction)
- Ignoring `signal` parameter (breaks cancellation)
- Hardcoding timeout values (use `createAdaptiveTimeout`)
- Not handling all failure classifications
