import type {
  AiPlanGenerationProvider,
  GenerationInput,
  GenerationOptions,
  ModuleLessonBatchGenerationInput,
  ProviderGenerateResult,
} from '@/features/ai/types/provider.types';

import { createAbortError } from '@/features/ai/abort';
import {
  ProviderError,
  ProviderRateLimitError,
  ProviderTimeoutError,
} from '@/features/ai/providers/errors';
import { asyncIterableToReadableStream } from '@/features/ai/streaming/utils';
import { aiEnv } from '@/lib/config/env';

// Timing thresholds for test mode behavior
const FAST_TEST_THRESHOLD_MS = 100;
const CHUNK_DELAY_MS = 50;

// Variance is only applied when delay >= 1000ms to ensure fast test runs
// are deterministic. Below this threshold, exact delay is used with no random variance.
const VARIANCE_THRESHOLD_MS = 1000;

type MockGenerationConfig = {
  delayMs?: number;
  failureRate?: number;
  deterministicSeed?: number; // If set, makes generation deterministic
  /** Overrides env MOCK_AI_SCENARIO when set (e.g. tests). */
  scenario?: string;
};

const TOPICS_TEMPLATES = {
  beginner: [
    'Getting Started',
    'Fundamentals',
    'Basic Concepts',
    'Introduction to Key Topics',
    'Essential Skills',
  ],
  intermediate: [
    'Deep Dive',
    'Advanced Techniques',
    'Practical Applications',
    'Real-World Projects',
    'Optimization Strategies',
  ],
  advanced: [
    'Expert-Level Mastery',
    'Architectural Patterns',
    'Performance Optimization',
    'Production Best Practices',
    'Cutting-Edge Techniques',
  ],
};

const TASK_TEMPLATES = {
  reading: [
    'Read documentation on',
    'Study the official guide for',
    'Review articles about',
    'Explore case studies on',
  ],
  video: [
    'Watch tutorial videos on',
    'Follow along with video course on',
    'View demonstrations of',
    'Complete video workshop on',
  ],
  practice: [
    'Build a practice project using',
    'Implement hands-on exercises for',
    'Create a demo application with',
    'Complete coding challenges on',
  ],
  mixed: [
    'Complete comprehensive tutorial on',
    'Work through guided project for',
    'Study and practice',
    'Learn by doing with',
  ],
};

/**
 * Seeded random number generator for deterministic tests
 * Uses a simple LCG (Linear Congruential Generator)
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    // LCG parameters from Numerical Recipes
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateModuleTitle(
  topic: string,
  skillLevel: string,
  moduleIndex: number,
): string {
  const templates =
    TOPICS_TEMPLATES[skillLevel as keyof typeof TOPICS_TEMPLATES] ??
    TOPICS_TEMPLATES.beginner;
  const template = templates[moduleIndex % templates.length] ?? templates[0];
  return `${template}: ${topic}`;
}

function generateTaskTitle(
  topic: string,
  learningStyle: string,
  taskIndex: number,
): string {
  const templates =
    TASK_TEMPLATES[learningStyle as keyof typeof TASK_TEMPLATES] ??
    TASK_TEMPLATES.mixed;
  const template =
    templates[taskIndex % templates.length] ??
    templates[0] ??
    'Complete task on';
  return `${template} ${topic}`;
}

function generateModules(input: GenerationInput, rng?: SeededRandom): unknown {
  const randomInt = (min: number, max: number) =>
    rng ? rng.nextInt(min, max) : getRandomInt(min, max);

  const moduleCount = randomInt(3, 5);
  const modules = [];

  for (let i = 0; i < moduleCount; i++) {
    const taskCount = randomInt(3, 5);
    const tasks = [];

    let totalTaskMinutes = 0;
    for (let j = 0; j < taskCount; j++) {
      const estimatedMinutes = randomInt(30, 90);
      totalTaskMinutes += estimatedMinutes;

      tasks.push({
        title: generateTaskTitle(input.topic, input.learningStyle, j),
        description: `Learn and practice key concepts related to ${input.topic}. This task will help you build practical skills.`,
        estimated_minutes: estimatedMinutes,
      });
    }

    // Module time should roughly match sum of tasks, add some buffer
    const moduleMinutes = Math.max(totalTaskMinutes, randomInt(120, 240));

    modules.push({
      title: generateModuleTitle(input.topic, input.skillLevel, i),
      description: `This module covers essential aspects of ${input.topic} tailored for ${input.skillLevel} level learners.`,
      estimated_minutes: moduleMinutes,
      tasks,
    });
  }

  return { modules };
}

function buildSyntheticModuleLessonBatchPayload(
  taskIds: readonly string[],
): unknown {
  return {
    version: 1,
    tasks: taskIds.map((taskId, index) => ({
      taskId,
      content: {
        version: 1,
        blocks: [
          { type: 'heading', text: `Lesson ${index + 1}` },
          {
            type: 'paragraph',
            text: `Mock lesson for task ${taskId.slice(0, 8)} (module batch).`,
          },
        ],
      },
    })),
  };
}

async function* createMockChunks(
  payload: unknown,
  delayMs: number,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const throwIfAborted = () => {
    if (signal?.aborted) {
      throw createAbortError('Mock provider generation aborted');
    }
  };

  const sleep = async (ms: number): Promise<void> => {
    if (ms <= 0) {
      return;
    }

    if (signal?.aborted) {
      throw createAbortError('Mock provider generation aborted');
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timeout);
        cleanup();
        reject(createAbortError('Mock provider generation aborted'));
      };

      const cleanup = () => {
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  };

  const serialized = JSON.stringify(payload);
  const chunkSize = 80;
  // Skip inter-chunk delays in fast test mode
  const chunkDelay = delayMs < FAST_TEST_THRESHOLD_MS ? 0 : CHUNK_DELAY_MS;

  // Simulate streaming with realistic delay
  for (let i = 0; i < serialized.length; i += chunkSize) {
    throwIfAborted();
    if (i > 0 && chunkDelay > 0) {
      // Add small delay between chunks to simulate network
      await sleep(chunkDelay);
    }
    throwIfAborted();
    yield serialized.slice(i, i + chunkSize);
  }

  // Final delay to simulate total generation time
  if (delayMs > 0) {
    await sleep(delayMs);
  }
}

function createMockStream(
  payload: unknown,
  delayMs: number,
  signal?: AbortSignal,
): ReadableStream<string> {
  return asyncIterableToReadableStream(
    createMockChunks(payload, delayMs, signal),
  );
}

type MockScenarioMessages = {
  timeout: string;
  providerError: string;
  rateLimit: string;
};

const PLAN_MOCK_SCENARIO_MESSAGES: MockScenarioMessages = {
  timeout: 'MOCK_AI_SCENARIO=timeout (mock)',
  providerError: 'MOCK_AI_SCENARIO=provider_error',
  rateLimit: 'MOCK_AI_SCENARIO=rate_limit',
};

const MODULE_BATCH_MOCK_SCENARIO_MESSAGES: MockScenarioMessages = {
  timeout: 'MOCK_AI_SCENARIO=timeout (mock module batch)',
  providerError: 'MOCK_AI_SCENARIO=provider_error (module batch)',
  rateLimit: 'MOCK_AI_SCENARIO=rate_limit (module batch)',
};

function resolveMockScenario(
  scenario: string | undefined,
  messages: MockScenarioMessages,
): Promise<ProviderGenerateResult> | null {
  if (scenario === 'timeout') {
    return Promise.reject(new ProviderTimeoutError(messages.timeout));
  }
  if (scenario === 'provider_error') {
    return Promise.reject(
      new ProviderError('provider_error', messages.providerError),
    );
  }
  if (scenario === 'rate_limit') {
    return Promise.reject(new ProviderRateLimitError(messages.rateLimit));
  }
  if (scenario === 'invalid_response') {
    return Promise.resolve(createInvalidMockResponseResult());
  }

  return null;
}

function createInvalidMockResponseResult(): ProviderGenerateResult {
  return {
    stream: new ReadableStream<string>({
      start(controller) {
        controller.enqueue('not-valid-json{{{');
        controller.close();
      },
    }),
    metadata: {
      provider: 'mock',
      model: 'mock-invalid',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    },
  };
}

function createMockRng(
  deterministicSeed: number | undefined,
): SeededRandom | undefined {
  return deterministicSeed !== undefined
    ? new SeededRandom(deterministicSeed)
    : undefined;
}

function shouldSimulateMockFailure(
  rng: SeededRandom | undefined,
  failureRate: number,
): boolean {
  const failureCheck = rng ? rng.next() : Math.random();
  return failureCheck < failureRate;
}

function validateMockFailureRate(failureRate: number): number {
  if (failureRate < 0 || failureRate > 1) {
    throw new RangeError(
      `Mock failureRate must be between 0 and 1 inclusive. Received: ${failureRate}`,
    );
  }

  return failureRate;
}

function computeMockDelay(
  baseDelay: number,
  rng: SeededRandom | undefined,
): number {
  if (baseDelay >= VARIANCE_THRESHOLD_MS) {
    const variance = rng ? rng.nextInt(-2000, 2000) : getRandomInt(-2000, 2000);
    return Math.max(VARIANCE_THRESHOLD_MS, baseDelay + variance);
  }

  return baseDelay;
}

function executeMockGeneration(args: {
  config: Required<
    Omit<MockGenerationConfig, 'deterministicSeed' | 'scenario'>
  > & { deterministicSeed?: number; scenario?: string };
  scenarioMessages: MockScenarioMessages;
  failureMessage: string;
  buildPayload: (rng: SeededRandom | undefined) => unknown;
  buildMetadata: () => ProviderGenerateResult['metadata'];
  options?: GenerationOptions;
}): Promise<ProviderGenerateResult> {
  const scenarioResult = resolveMockScenario(
    args.config.scenario,
    args.scenarioMessages,
  );
  if (scenarioResult) {
    return scenarioResult;
  }

  const rng = createMockRng(args.config.deterministicSeed);
  if (shouldSimulateMockFailure(rng, args.config.failureRate)) {
    return Promise.reject(
      new ProviderError('provider_error', args.failureMessage),
    );
  }

  const payload = args.buildPayload(rng);
  const actualDelay = computeMockDelay(args.config.delayMs, rng);

  return Promise.resolve({
    stream: createMockStream(payload, actualDelay, args.options?.signal),
    metadata: args.buildMetadata(),
  });
}

export class MockGenerationProvider implements AiPlanGenerationProvider {
  private readonly config: Required<
    Omit<MockGenerationConfig, 'deterministicSeed' | 'scenario'>
  > & { deterministicSeed?: number; scenario?: string };

  constructor(config: MockGenerationConfig = {}) {
    this.config = {
      delayMs: config.delayMs ?? aiEnv.mock?.delayMs ?? 7000,
      failureRate: validateMockFailureRate(
        config.failureRate ?? aiEnv.mock?.failureRate ?? 0,
      ),
      deterministicSeed: config.deterministicSeed,
      scenario: config.scenario ?? aiEnv.mockScenario,
    };
  }

  generate(
    input: GenerationInput,
    options?: GenerationOptions,
  ): Promise<ProviderGenerateResult> {
    return executeMockGeneration({
      config: this.config,
      scenarioMessages: PLAN_MOCK_SCENARIO_MESSAGES,
      failureMessage: 'Mock provider simulated failure for testing',
      buildPayload: (rng) => generateModules(input, rng),
      buildMetadata: () => ({
        provider: 'mock',
        model: 'mock-generator-v1',
        usage: {
          promptTokens: 100,
          completionTokens: 500,
          totalTokens: 600,
        },
      }),
      options,
    });
  }

  generateModuleLessonBatch(
    input: ModuleLessonBatchGenerationInput,
    options?: GenerationOptions,
  ): Promise<ProviderGenerateResult> {
    return executeMockGeneration({
      config: this.config,
      scenarioMessages: MODULE_BATCH_MOCK_SCENARIO_MESSAGES,
      failureMessage: 'Mock module batch simulated failure for testing',
      buildPayload: (_rng) =>
        buildSyntheticModuleLessonBatchPayload(input.taskIds),
      buildMetadata: () => ({
        provider: 'mock',
        model: 'mock-module-lesson-batch-v1',
        usage: {
          promptTokens: 120,
          completionTokens: 800,
          totalTokens: 920,
        },
      }),
      options,
    });
  }
}
