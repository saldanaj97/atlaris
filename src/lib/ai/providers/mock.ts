import { aiEnv } from '@/lib/config/env';
import type {
  AiPlanGenerationProvider,
  GenerationInput,
  GenerationOptions,
  ProviderGenerateResult,
} from '../provider';
import { ProviderError } from '../provider';

// Timing thresholds for test mode behavior
const FAST_TEST_THRESHOLD_MS = 100;
const CHUNK_DELAY_MS = 50;
// Variance is only applied when delay >= 1000ms to ensure fast test runs
// are deterministic. Below this threshold, exact delay is used with no random variance.
const VARIANCE_THRESHOLD_MS = 1000;

export interface MockGenerationConfig {
  delayMs?: number;
  failureRate?: number;
  deterministicSeed?: number; // If set, makes generation deterministic
}

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
  moduleIndex: number
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
  taskIndex: number
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

async function* createMockStream(
  payload: unknown,
  delayMs: number
): AsyncIterable<string> {
  const serialized = JSON.stringify(payload);
  const chunkSize = 80;
  // Skip inter-chunk delays in fast test mode
  const chunkDelay = delayMs < FAST_TEST_THRESHOLD_MS ? 0 : CHUNK_DELAY_MS;

  // Simulate streaming with realistic delay
  for (let i = 0; i < serialized.length; i += chunkSize) {
    if (i > 0 && chunkDelay > 0) {
      // Add small delay between chunks to simulate network
      await new Promise((resolve) => setTimeout(resolve, chunkDelay));
    }
    yield serialized.slice(i, i + chunkSize);
  }

  // Final delay to simulate total generation time
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

export class MockGenerationProvider implements AiPlanGenerationProvider {
  private readonly config: Required<
    Omit<MockGenerationConfig, 'deterministicSeed'>
  > & { deterministicSeed?: number };

  constructor(config: MockGenerationConfig = {}) {
    this.config = {
      delayMs: config.delayMs ?? aiEnv.mock?.delayMs ?? 7000,
      failureRate: config.failureRate ?? aiEnv.mock?.failureRate ?? 0,
      deterministicSeed: config.deterministicSeed,
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async generate(
    input: GenerationInput,
    _options?: GenerationOptions
  ): Promise<ProviderGenerateResult> {
    // Create seeded RNG if seed is provided
    const rng =
      this.config.deterministicSeed !== undefined
        ? new SeededRandom(this.config.deterministicSeed)
        : undefined;

    // Simulate random failures based on configured rate
    const failureCheck = rng ? rng.next() : Math.random();
    if (failureCheck < this.config.failureRate) {
      throw new ProviderError(
        'unknown',
        'Mock provider simulated failure for testing'
      );
    }

    // Generate realistic modules based on input
    const payload = generateModules(input, rng);

    // Random delay (configurable via env, or deterministic if seeded)
    const baseDelay = this.config.delayMs;
    // Only apply variance if delay is large enough
    // For fast test mode (below threshold), use exact delay with no minimum floor
    const variance =
      baseDelay >= VARIANCE_THRESHOLD_MS
        ? rng
          ? rng.nextInt(-2000, 2000)
          : getRandomInt(-2000, 2000)
        : 0;
    const actualDelay =
      baseDelay >= VARIANCE_THRESHOLD_MS
        ? Math.max(VARIANCE_THRESHOLD_MS, baseDelay + variance)
        : baseDelay;

    return {
      stream: createMockStream(payload, actualDelay),
      metadata: {
        provider: 'mock',
        model: 'mock-generator-v1',
        usage: {
          promptTokens: 100,
          completionTokens: 500,
          totalTokens: 600,
        },
      },
    };
  }
}
