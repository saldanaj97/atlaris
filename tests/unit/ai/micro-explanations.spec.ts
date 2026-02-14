import {
  formatMicroExplanation,
  generateMicroExplanation,
} from '@/lib/ai/micro-explanations';
import {
  buildMicroExplanationSystemPrompt,
  buildMicroExplanationUserPrompt,
} from '@/lib/ai/prompts';
import type { AiPlanGenerationProvider } from '@/lib/ai/types/provider.types';
import { generateObject } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the AI SDK
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    generateObject: vi.fn(),
  };
});

// Mock OpenAI provider (used by OpenRouter)
vi.mock('@ai-sdk/openai', () => {
  const mockModel = vi.fn();
  return {
    createOpenAI: vi.fn(() => mockModel),
  };
});

describe('Micro-explanations', () => {
  describe('Prompt builders', () => {
    it('buildMicroExplanationSystemPrompt returns JSON-only instructions', () => {
      const prompt = buildMicroExplanationSystemPrompt();
      expect(prompt).toContain('Output must be valid JSON');
      expect(prompt).toContain('"explanation": "2-3 sentences');
      expect(prompt).toContain('Keep explanations concise');
    });

    it('buildMicroExplanationUserPrompt includes required fields', () => {
      const params = {
        topic: 'React Hooks',
        moduleTitle: 'Component State',
        taskTitle: 'Use useState',
        skillLevel: 'beginner' as const,
      };
      const prompt = buildMicroExplanationUserPrompt(params);
      expect(prompt).toContain('Topic: React Hooks');
      expect(prompt).toContain('Task: Use useState');
      expect(prompt).toContain('Skill Level: beginner');
      expect(prompt).toContain('Provide:');
      expect(prompt).toContain('Return JSON only');
    });

    it('buildMicroExplanationUserPrompt omits moduleTitle if not provided', () => {
      const params = {
        topic: 'React Hooks',
        taskTitle: 'Use useState',
        skillLevel: 'beginner' as const,
      };
      const prompt = buildMicroExplanationUserPrompt(params);
      expect(prompt).not.toContain('Module:');
    });
  });

  describe('generateMicroExplanation', () => {
    const configuredProvider = {
      generate: vi.fn(),
      getMicroExplanationConfig: () => ({
        apiKey: 'test-openrouter-key',
        baseUrl: 'https://openrouter.ai/api/v1',
      }),
    } as unknown as AiPlanGenerationProvider;

    const unconfiguredProvider = {
      generate: vi.fn(),
      getMicroExplanationConfig: () => null,
    } as unknown as AiPlanGenerationProvider;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns formatted markdown from structured response', async () => {
      vi.mocked(generateObject).mockResolvedValue({
        object: {
          explanation:
            'useState manages local state in functional components. It returns an array with the current state and a setter function. Always call the setter with a new value to trigger re-renders.',
          practice:
            'Try creating a counter component that increments a number using useState.',
        },
        usage: {
          inputTokens: 50,
          outputTokens: 30,
          totalTokens: 80,
        },
      } as Awaited<ReturnType<typeof generateObject>>);

      const result = await generateMicroExplanation(configuredProvider, {
        topic: 'React Hooks',
        taskTitle: 'Use useState',
        skillLevel: 'beginner',
      });

      expect(generateObject).toHaveBeenCalled();
      expect(result).toContain('useState manages local state');
      expect(result).toContain(
        '**Practice:** Try creating a counter component'
      );
    });

    it('handles response without practice exercise', async () => {
      vi.mocked(generateObject).mockResolvedValue({
        object: {
          explanation: 'useState is a React hook for managing component state.',
        },
        usage: {
          inputTokens: 50,
          outputTokens: 20,
          totalTokens: 70,
        },
      } as Awaited<ReturnType<typeof generateObject>>);

      const result = await generateMicroExplanation(configuredProvider, {
        topic: 'React Hooks',
        taskTitle: 'Use useState',
        skillLevel: 'beginner',
      });

      expect(result).toBe(
        'useState is a React hook for managing component state.'
      );
      expect(result).not.toContain('**Practice:**');
    });

    it('rejects when provider reports unconfigured (getMicroExplanationConfig returns null)', async () => {
      await expect(
        generateMicroExplanation(unconfiguredProvider, {
          topic: 'React Hooks',
          taskTitle: 'Use useState',
          skillLevel: 'beginner',
        })
      ).rejects.toThrow('OpenRouter API key is not configured');
    });

    it('rejects when provider returns config without apiKey', async () => {
      const noApiKeyProvider = {
        generate: vi.fn(),
        getMicroExplanationConfig: () => ({
          apiKey: '',
          baseUrl: 'https://openrouter.ai/api/v1',
        }),
      } as unknown as AiPlanGenerationProvider;

      await expect(
        generateMicroExplanation(noApiKeyProvider, {
          topic: 'React Hooks',
          taskTitle: 'Use useState',
          skillLevel: 'beginner',
        })
      ).rejects.toThrow('OpenRouter API key is not configured');
    });

    it('rejects when provider lacks getMicroExplanationConfig', async () => {
      const providerWithoutConfig = {
        generate: vi.fn(),
      } as unknown as AiPlanGenerationProvider;

      await expect(
        generateMicroExplanation(providerWithoutConfig, {
          topic: 'React Hooks',
          taskTitle: 'Use useState',
          skillLevel: 'beginner',
        })
      ).rejects.toThrow('OpenRouter API key is not configured');
    });

    it('formats micro-explanation with practice exercise', () => {
      const explanation = {
        explanation: 'useState is a React hook for state management.',
        practice: 'Create a counter with increment button.',
      };
      const result = formatMicroExplanation(explanation);
      expect(result).toContain('useState is a React hook');
      expect(result).toContain('**Practice:** Create a counter');
    });

    it('formats micro-explanation without practice', () => {
      const explanation = {
        explanation: 'useState is a React hook for state management.',
      };
      const result = formatMicroExplanation(explanation);
      expect(result).toBe('useState is a React hook for state management.');
      expect(result).not.toContain('**Practice:**');
    });
  });
});
