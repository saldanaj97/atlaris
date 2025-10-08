import type {
  AiPlanGenerationProvider,
  GenerationInput,
  GenerationOptions,
  ProviderGenerateResult,
} from '../provider';
import { ProviderError } from '../provider';

export interface MockGenerationConfig {
  delayMs?: number;
  failureRate?: number;
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

function generateModules(input: GenerationInput): unknown {
  const moduleCount = getRandomInt(3, 5);
  const modules = [];

  for (let i = 0; i < moduleCount; i++) {
    const taskCount = getRandomInt(3, 5);
    const tasks = [];

    let totalTaskMinutes = 0;
    for (let j = 0; j < taskCount; j++) {
      const estimatedMinutes = getRandomInt(30, 90);
      totalTaskMinutes += estimatedMinutes;

      tasks.push({
        title: generateTaskTitle(input.topic, input.learningStyle, j),
        description: `Learn and practice key concepts related to ${input.topic}. This task will help you build practical skills.`,
        estimated_minutes: estimatedMinutes,
      });
    }

    // Module time should roughly match sum of tasks, add some buffer
    const moduleMinutes = Math.max(totalTaskMinutes, getRandomInt(120, 240));

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

  // Simulate streaming with realistic delay
  for (let i = 0; i < serialized.length; i += chunkSize) {
    if (i > 0) {
      // Add small delay between chunks to simulate network
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    yield serialized.slice(i, i + chunkSize);
  }

  // Final delay to simulate total generation time
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export class MockGenerationProvider implements AiPlanGenerationProvider {
  private readonly config: Required<MockGenerationConfig>;

  constructor(config: MockGenerationConfig = {}) {
    this.config = {
      delayMs:
        config.delayMs ??
        parseInt(process.env.MOCK_GENERATION_DELAY_MS ?? '7000', 10),
      failureRate:
        config.failureRate ??
        parseFloat(process.env.MOCK_GENERATION_FAILURE_RATE ?? '0'),
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async generate(
    input: GenerationInput,
    _options?: GenerationOptions
  ): Promise<ProviderGenerateResult> {
    // Simulate random failures based on configured rate
    if (Math.random() < this.config.failureRate) {
      throw new ProviderError(
        'unknown',
        'Mock provider simulated failure for testing'
      );
    }

    // Generate realistic modules based on input
    const payload = generateModules(input);

    // Random delay between 5-10 seconds (configurable via env)
    const baseDelay = this.config.delayMs;
    const variance = getRandomInt(-2000, 2000);
    const actualDelay = Math.max(1000, baseDelay + variance);

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
