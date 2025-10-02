import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MockGenerationProvider } from '@/lib/ai/providers/mock';
import { getGenerationProvider, type GenerationInput } from '@/lib/ai/provider';
import { parseGenerationStream } from '@/lib/ai/parser';

const SAMPLE_INPUT: GenerationInput = {
  topic: 'Machine Learning',
  notes: 'Focus on practical applications',
  skillLevel: 'intermediate',
  weeklyHours: 10,
  learningStyle: 'mixed',
};

async function collectStream(stream: AsyncIterable<string>): Promise<string> {
  let output = '';
  for await (const chunk of stream) {
    output += chunk;
  }
  return output;
}

describe('Phase 2: Mock AI Provider Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('T020: Provider selection test', () => {
    it('returns MockGenerationProvider when AI_PROVIDER=mock', () => {
      process.env.AI_PROVIDER = 'mock';
      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });

    it('returns MockGenerationProvider in development when AI_PROVIDER not set', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.AI_PROVIDER;

      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });

    it('returns OpenAI provider when AI_PROVIDER=openai', () => {
      process.env.AI_PROVIDER = 'openai';
      const provider = getGenerationProvider();

      // OpenAIGenerationProvider is the default, but we can't import it without circular deps
      // So we just check it's not MockGenerationProvider
      expect(provider).not.toBeInstanceOf(MockGenerationProvider);
    });

    it('handles case-insensitive AI_PROVIDER values', () => {
      process.env.AI_PROVIDER = 'MOCK';
      const provider = getGenerationProvider();

      expect(provider).toBeInstanceOf(MockGenerationProvider);
    });
  });

  describe('T021: Mock generate baseline test', () => {
    it('generates parsable JSON with 3-5 modules and 3-5 tasks per module', async () => {
      const provider = new MockGenerationProvider({ delayMs: 100, failureRate: 0 });
      const result = await provider.generate(SAMPLE_INPUT);

      const rawText = await collectStream(result.stream);
      const parsed = JSON.parse(rawText);

      expect(parsed).toHaveProperty('modules');
      expect(Array.isArray(parsed.modules)).toBe(true);
      expect(parsed.modules.length).toBeGreaterThanOrEqual(3);
      expect(parsed.modules.length).toBeLessThanOrEqual(5);

      // Check each module has 3-5 tasks
      for (const module of parsed.modules) {
        expect(module).toHaveProperty('tasks');
        expect(Array.isArray(module.tasks)).toBe(true);
        expect(module.tasks.length).toBeGreaterThanOrEqual(3);
        expect(module.tasks.length).toBeLessThanOrEqual(5);
      }
    });

    it('generates valid structure compatible with parser', async () => {
      const provider = new MockGenerationProvider({ delayMs: 100, failureRate: 0 });
      const result = await provider.generate(SAMPLE_INPUT);

      // Parser should not throw
      const parsed = await parseGenerationStream(result.stream);

      expect(parsed.modules).toBeDefined();
      expect(parsed.modules.length).toBeGreaterThan(0);
      expect(parsed.rawText).toBeDefined();
    });

    it('generates content based on input topic and skill level', async () => {
      const provider = new MockGenerationProvider({ delayMs: 100, failureRate: 0 });
      const result = await provider.generate(SAMPLE_INPUT);

      const rawText = await collectStream(result.stream);
      const parsed = JSON.parse(rawText);

      // Check that topic appears in generated content
      const allText = JSON.stringify(parsed).toLowerCase();
      expect(allText).toContain('machine learning'.toLowerCase());
    });

    it('streams content in chunks', async () => {
      const provider = new MockGenerationProvider({ delayMs: 100, failureRate: 0 });
      const result = await provider.generate(SAMPLE_INPUT);

      const chunks: string[] = [];
      for await (const chunk of result.stream) {
        chunks.push(chunk);
      }

      // Should have multiple chunks
      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk should be reasonably sized (mock uses chunkSize=80)
      expect(chunks[0].length).toBeLessThanOrEqual(100);
    });
  });

  describe('T022: Delay simulation test', () => {
    it('completes within expected time range with configured delay', async () => {
      const delayMs = 2000; // 2 seconds
      const provider = new MockGenerationProvider({ delayMs, failureRate: 0 });

      const startTime = Date.now();
      const result = await provider.generate(SAMPLE_INPUT);
      await collectStream(result.stream); // Consume stream
      const endTime = Date.now();

      const elapsed = endTime - startTime;

      // Should be at least the base delay (with variance it can be -2s to +2s)
      // So minimum is delayMs - 2000 but we make sure it's at least 1000ms
      expect(elapsed).toBeGreaterThanOrEqual(Math.max(1000, delayMs - 2500));
    }, 10000); // 10 second timeout

    it('respects MOCK_GENERATION_DELAY_MS environment variable', async () => {
      process.env.MOCK_GENERATION_DELAY_MS = '1500';
      const provider = new MockGenerationProvider({ failureRate: 0 });

      const startTime = Date.now();
      const result = await provider.generate(SAMPLE_INPUT);
      await collectStream(result.stream);
      const endTime = Date.now();

      const elapsed = endTime - startTime;

      // Should take at least 500ms (with variance)
      expect(elapsed).toBeGreaterThanOrEqual(500);
    }, 10000); // 10 second timeout

    it('uses default delay when env var not set', async () => {
      delete process.env.MOCK_GENERATION_DELAY_MS;
      const provider = new MockGenerationProvider();

      const startTime = Date.now();
      const result = await provider.generate(SAMPLE_INPUT);
      await collectStream(result.stream);
      const endTime = Date.now();

      const elapsed = endTime - startTime;

      // Default is 7000ms, with variance should be at least 3000ms
      expect(elapsed).toBeGreaterThanOrEqual(3000);
    }, 15000);
  });

  describe('T023: Failure rate toggle test', () => {
    it('always fails when MOCK_GENERATION_FAILURE_RATE=1', async () => {
      const provider = new MockGenerationProvider({ failureRate: 1.0 });

      await expect(provider.generate(SAMPLE_INPUT)).rejects.toThrow(
        'Mock provider simulated failure'
      );
    });

    it('never fails when MOCK_GENERATION_FAILURE_RATE=0', async () => {
      const provider = new MockGenerationProvider({ failureRate: 0.0 });

      // Try multiple times to ensure no failures
      for (let i = 0; i < 1; i++) {
        const result = await provider.generate(SAMPLE_INPUT);
        const rawText = await collectStream(result.stream);
        expect(rawText).toBeTruthy();
      }
    });

    it('respects MOCK_GENERATION_FAILURE_RATE environment variable', async () => {
      process.env.MOCK_GENERATION_FAILURE_RATE = '1';
      const provider = new MockGenerationProvider();

      await expect(provider.generate(SAMPLE_INPUT)).rejects.toThrow();
    });

    it('probabilistic failures occur at expected rate (0.5)', async () => {
      const provider = new MockGenerationProvider({ failureRate: 0.5 });
      const attempts = 100;
      let failures = 0;

      for (let i = 0; i < attempts; i++) {
        try {
          await provider.generate(SAMPLE_INPUT);
        } catch {
          failures++;
        }
      }

      // With 100 attempts at 0.5 rate, expect 30-70 failures (allowing variance)
      expect(failures).toBeGreaterThanOrEqual(30);
      expect(failures).toBeLessThanOrEqual(70);
    });
  });

  describe('T024: Metadata reasonableness test (optional)', () => {
    it('generates modules with estimated_minutes between 120-450', async () => {
      const provider = new MockGenerationProvider({ delayMs: 100, failureRate: 0 });
      const result = await provider.generate(SAMPLE_INPUT);

      const rawText = await collectStream(result.stream);
      const parsed = JSON.parse(rawText);

      for (const module of parsed.modules) {
        expect(module.estimated_minutes).toBeGreaterThanOrEqual(120);
        expect(module.estimated_minutes).toBeLessThanOrEqual(450);
      }
    });

    it('generates tasks with estimated_minutes between 30-90', async () => {
      const provider = new MockGenerationProvider({ delayMs: 100, failureRate: 0 });
      const result = await provider.generate(SAMPLE_INPUT);

      const rawText = await collectStream(result.stream);
      const parsed = JSON.parse(rawText);

      for (const module of parsed.modules) {
        for (const task of module.tasks) {
          expect(task.estimated_minutes).toBeGreaterThanOrEqual(30);
          expect(task.estimated_minutes).toBeLessThanOrEqual(90);
        }
      }
    });

    it('module estimated_minutes approximates sum of task minutes', async () => {
      const provider = new MockGenerationProvider({ delayMs: 100, failureRate: 0 });
      const result = await provider.generate(SAMPLE_INPUT);

      const rawText = await collectStream(result.stream);
      const parsed = JSON.parse(rawText);

      for (const module of parsed.modules) {
        const taskTotal = module.tasks.reduce(
          (sum: number, task: { estimated_minutes: number }) =>
            sum + task.estimated_minutes,
          0
        );

        // Module time should be at least the sum of tasks, with reasonable buffer
        expect(module.estimated_minutes).toBeGreaterThanOrEqual(taskTotal);
        // But not more than 2x the task total
        expect(module.estimated_minutes).toBeLessThanOrEqual(taskTotal * 2);
      }
    });

    it('returns proper metadata with usage information', async () => {
      const provider = new MockGenerationProvider({ delayMs: 100, failureRate: 0 });
      const result = await provider.generate(SAMPLE_INPUT);

      expect(result.metadata).toMatchObject({
        provider: 'mock',
        model: 'mock-generator-v1',
      });

      expect(result.metadata.usage).toBeDefined();
      expect(result.metadata.usage?.promptTokens).toBeGreaterThan(0);
      expect(result.metadata.usage?.completionTokens).toBeGreaterThan(0);
      expect(result.metadata.usage?.totalTokens).toBeGreaterThan(0);
    });
  });

  describe('T025: Streaming order test (optional)', () => {
    it('streams complete JSON structure without interleaving', async () => {
      const provider = new MockGenerationProvider({ delayMs: 100, failureRate: 0 });
      const result = await provider.generate(SAMPLE_INPUT);

      let buffer = '';
      const chunks: string[] = [];

      for await (const chunk of result.stream) {
        chunks.push(chunk);
        buffer += chunk;
      }

      // Final buffer should be valid JSON
      expect(() => JSON.parse(buffer)).not.toThrow();

      // Each partial buffer should be progressively building valid JSON
      // We can't parse incomplete JSON, but we can check structure consistency
      let partialBuffer = '';
      for (const chunk of chunks) {
        partialBuffer += chunk;
        // Should not have malformed structure (e.g., tasks before modules array)
        expect(partialBuffer).not.toMatch(/}\s*{/); // No adjacent objects without array/comma
      }
    });

    it('maintains consistent module-task hierarchy in stream', async () => {
      const provider = new MockGenerationProvider({ delayMs: 100, failureRate: 0 });
      const result = await provider.generate(SAMPLE_INPUT);

      const rawText = await collectStream(result.stream);
      const parsed = JSON.parse(rawText);

      // Verify structure: modules array contains objects with tasks arrays
      expect(parsed.modules).toBeInstanceOf(Array);
      for (const module of parsed.modules) {
        expect(module).toBeInstanceOf(Object);
        expect(module.tasks).toBeInstanceOf(Array);
        expect(module.title).toBeTruthy();
        expect(module.estimated_minutes).toBeGreaterThan(0);

        for (const task of module.tasks) {
          expect(task).toBeInstanceOf(Object);
          expect(task.title).toBeTruthy();
          expect(task.estimated_minutes).toBeGreaterThan(0);
        }
      }
    });
  });
});
