import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import {
  generateMicroExplanation,
  formatMicroExplanation,
} from '@/lib/ai/micro-explanations';
import {
  buildMicroExplanationSystemPrompt,
  buildMicroExplanationUserPrompt,
} from '@/lib/ai/prompts';
import type { AiPlanGenerationProvider } from '@/lib/ai/provider';

// Mock the AI provider
vi.mock('@/lib/ai/provider', () => ({
  AiPlanGenerationProvider: vi.fn(),
}));

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
    let mockProvider: Mocked<AiPlanGenerationProvider>;
    let mockGenerate: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockGenerate = vi.fn();
      mockProvider = {
        generate: mockGenerate,
      } as any;
    });

    it('parses valid JSON stream and returns formatted markdown', async () => {
      // Mock stream chunks that form valid JSON
      const chunks = [
        '{',
        '"explanation": "useState manages local state in functional components. It returns an array with the current state and a setter function. Always call the setter with a new value to trigger re-renders.",',
        '"practice": "Try creating a counter component that increments a number using useState."',
        '}',
      ];
      mockGenerate.mockResolvedValue({
        stream: (async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        })(),
        metadata: {},
      });

      const result = await generateMicroExplanation(mockProvider, {
        topic: 'React Hooks',
        taskTitle: 'Use useState',
        skillLevel: 'beginner',
      });

      expect(mockGenerate).toHaveBeenCalled();
      expect(result).toContain('useState manages local state');
      expect(result).toContain(
        '**Practice:** Try creating a counter component'
      );
    });

    it('falls back to raw text when JSON parsing fails', async () => {
      mockGenerate.mockResolvedValue({
        stream: (async function* () {
          yield 'This is a simple explanation without JSON structure.';
        })(),
        metadata: {},
      });

      const result = await generateMicroExplanation(mockProvider, {
        topic: 'React Hooks',
        taskTitle: 'Use useState',
        skillLevel: 'beginner',
      });

      expect(result).toBe(
        'This is a simple explanation without JSON structure.'
      );
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
