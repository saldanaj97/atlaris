import {
  ProviderError,
  ProviderMetadata,
  ProviderNotImplementedError,
  ProviderRateLimitError,
  ProviderTimeoutError,
  type AiPlanGenerationProvider,
  type GenerationInput,
  type GenerationOptions,
  type ProviderGenerateResult,
} from '../../src/lib/ai/provider';

export type MockProviderScenario =
  | 'success'
  | 'timeout'
  | 'validation'
  | 'rate_limit'
  | 'error';

export interface MockProviderConfig {
  scenario: MockProviderScenario;
  chunkSize?: number;
  delayBetweenChunksMs?: number;
}

export interface MockProvider {
  provider: AiPlanGenerationProvider;
  readonly invocationCount: number;
}

const SUCCESS_PAYLOAD = {
  modules: [
    {
      title: 'Getting Started with Machine Learning',
      estimated_minutes: 180,
      tasks: [
        {
          title: 'Understand supervised vs. unsupervised learning',
          estimated_minutes: 60,
        },
        { title: 'Install Python ML tooling', estimated_minutes: 45 },
        {
          title: 'Complete first classification notebook',
          estimated_minutes: 75,
        },
      ],
    },
    {
      title: 'Model Evaluation Deep Dive',
      estimated_minutes: 200,
      tasks: [
        { title: 'Explore precision/recall metrics', estimated_minutes: 60 },
        { title: 'Implement k-fold cross-validation', estimated_minutes: 80 },
        { title: 'Document evaluation trade-offs', estimated_minutes: 60 },
      ],
    },
  ],
} as const;

const VALIDATION_PAYLOAD = {
  modules: [],
} as const;

function createChunkStream(
  payload: unknown,
  chunkSize: number,
  delayBetweenChunksMs: number
): AsyncIterable<string> {
  const serialized = JSON.stringify(payload);
  return {
    async *[Symbol.asyncIterator]() {
      for (let index = 0; index < serialized.length; index += chunkSize) {
        if (delayBetweenChunksMs > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, delayBetweenChunksMs)
          );
        }
        yield serialized.slice(index, index + chunkSize);
      }
    },
  };
}

function buildResult(
  payload: unknown,
  metadataOverride?: Partial<ProviderMetadata>,
  options?: { chunkSize?: number; delayBetweenChunksMs?: number }
): ProviderGenerateResult {
  const { chunkSize = 80, delayBetweenChunksMs = 0 } = options ?? {};
  return {
    stream: createChunkStream(payload, chunkSize, delayBetweenChunksMs),
    metadata: {
      provider: 'mock-ai',
      model: 'mock-gpt-4o-mini',
      ...metadataOverride,
    },
  };
}

export function createMockProvider(config: MockProviderConfig): MockProvider {
  let invocationCount = 0;

  const provider: AiPlanGenerationProvider = {
    generate(
      _input: GenerationInput,
      _options?: GenerationOptions
    ): Promise<ProviderGenerateResult> {
      invocationCount += 1;

      switch (config.scenario) {
        case 'success':
          return Promise.resolve(
            buildResult(SUCCESS_PAYLOAD, undefined, config)
          );
        case 'validation':
          return Promise.resolve(
            buildResult(VALIDATION_PAYLOAD, undefined, config)
          );
        case 'rate_limit':
          return Promise.reject(
            new ProviderRateLimitError('Mock provider simulated rate limit.')
          );
        case 'timeout':
          return Promise.reject(
            new ProviderTimeoutError('Mock provider simulated timeout.')
          );
        case 'error':
          return Promise.reject(
            new ProviderError('unknown', 'Mock provider simulated failure.')
          );
        default:
          return Promise.reject(
            new ProviderNotImplementedError(
              `Mock provider scenario "${String(config.scenario)}" not implemented.`
            )
          );
      }
    },
  };

  return {
    provider,
    get invocationCount() {
      return invocationCount;
    },
  };
}
