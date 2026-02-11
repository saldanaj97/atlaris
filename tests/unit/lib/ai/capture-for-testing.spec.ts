import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { captureForTesting, type CapturedInput } from '@/lib/ai/capture-for-testing';
import type { AiPlanGenerationProvider, GenerationInput } from '@/lib/ai/provider';

const mockProvider: AiPlanGenerationProvider = {
  generate: vi.fn(),
} as unknown as AiPlanGenerationProvider;

const mockInput: GenerationInput = {
  topic: 'TypeScript',
  notes: null,
  pdfContext: null,
  skillLevel: 'beginner',
  weeklyHours: 5,
  learningStyle: 'mixed',
  startDate: null,
  deadlineDate: null,
};

describe('captureForTesting', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete (globalThis as any).__capturedInputs;
  });

  afterEach(() => {
    process.env = originalEnv;
    delete (globalThis as any).__capturedInputs;
    vi.restoreAllMocks();
  });

  it('does nothing when not in test environment', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const capturedInputs: CapturedInput[] = [];
    (globalThis as any).__capturedInputs = capturedInputs;

    captureForTesting(mockProvider, mockInput);

    expect(capturedInputs).toHaveLength(0);
  });

  it('throws error when called in production environment', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VERCEL_ENV', 'production');

    expect(() => captureForTesting(mockProvider, mockInput)).toThrow(
      'captureForTesting invoked in production'
    );
  });

  it('captures provider and input when in test environment', () => {
    vi.stubEnv('NODE_ENV', 'test');
    const capturedInputs: CapturedInput[] = [];
    (globalThis as any).__capturedInputs = capturedInputs;

    captureForTesting(mockProvider, mockInput);

    expect(capturedInputs).toHaveLength(1);
    expect(capturedInputs[0]).toMatchObject({
      provider: expect.any(String),
      input: mockInput,
    });
  });

  it('captures input with correct topic and settings', () => {
    vi.stubEnv('NODE_ENV', 'test');
    const capturedInputs: CapturedInput[] = [];
    (globalThis as any).__capturedInputs = capturedInputs;

    const customInput: GenerationInput = {
      topic: 'Advanced React',
      notes: 'Focus on hooks',
      pdfContext: {
        mainTopic: 'React Handbook',
        sections: [
          {
            title: 'Hooks',
            content: 'useState and useEffect',
            level: 1,
          },
        ],
      },
      skillLevel: 'advanced',
      weeklyHours: 10,
      learningStyle: 'practice',
      startDate: '2024-01-01',
      deadlineDate: '2024-12-31',
    };

    captureForTesting(mockProvider, customInput);

    expect(capturedInputs).toHaveLength(1);
    expect(capturedInputs[0].input).toEqual(customInput);
  });

  it('does nothing when globalThis.__capturedInputs is undefined', () => {
    vi.stubEnv('NODE_ENV', 'test');

    // Should not throw
    expect(() => captureForTesting(mockProvider, mockInput)).not.toThrow();
  });

  it('appends to existing captured inputs', () => {
    vi.stubEnv('NODE_ENV', 'test');
    const existingInput: CapturedInput = {
      provider: 'ExistingProvider',
      input: mockInput,
    };
    const capturedInputs: CapturedInput[] = [existingInput];
    (globalThis as any).__capturedInputs = capturedInputs;

    captureForTesting(mockProvider, mockInput);

    expect(capturedInputs).toHaveLength(2);
    expect(capturedInputs[0]).toEqual(existingInput);
  });

  it('handles provider with constructor name', () => {
    vi.stubEnv('NODE_ENV', 'test');
    const capturedInputs: CapturedInput[] = [];
    (globalThis as any).__capturedInputs = capturedInputs;

    class TestProvider implements AiPlanGenerationProvider {
      async generate() {
        return {
          stream: (async function* () {})(),
          metadata: { provider: 'test', model: 'test-model', usage: {} },
        };
      }
    }

    const provider = new TestProvider();
    captureForTesting(provider, mockInput);

    expect(capturedInputs).toHaveLength(1);
    expect(capturedInputs[0].provider).toBe('TestProvider');
  });

  it('uses "unknown" when provider has no constructor name', () => {
    vi.stubEnv('NODE_ENV', 'test');
    const capturedInputs: CapturedInput[] = [];
    (globalThis as any).__capturedInputs = capturedInputs;

    const providerWithoutName = {
      generate: vi.fn(),
    } as AiPlanGenerationProvider;

    captureForTesting(providerWithoutName, mockInput);

    expect(capturedInputs).toHaveLength(1);
    expect(capturedInputs[0].provider).toBe('unknown');
  });

  it('captures multiple inputs in sequence', () => {
    vi.stubEnv('NODE_ENV', 'test');
    const capturedInputs: CapturedInput[] = [];
    (globalThis as any).__capturedInputs = capturedInputs;

    const input1: GenerationInput = { ...mockInput, topic: 'TypeScript' };
    const input2: GenerationInput = { ...mockInput, topic: 'JavaScript' };
    const input3: GenerationInput = { ...mockInput, topic: 'Python' };

    captureForTesting(mockProvider, input1);
    captureForTesting(mockProvider, input2);
    captureForTesting(mockProvider, input3);

    expect(capturedInputs).toHaveLength(3);
    expect(capturedInputs[0].input.topic).toBe('TypeScript');
    expect(capturedInputs[1].input.topic).toBe('JavaScript');
    expect(capturedInputs[2].input.topic).toBe('Python');
  });
});