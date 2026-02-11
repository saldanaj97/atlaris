import { describe, expect, it } from 'vitest';

import {
  buildPlanProviderResult,
  generatePlanObject,
  type BuildPlanProviderResultParams,
  type GeneratePlanObjectResult,
} from '@/lib/ai/providers/base';
import type { GenerationInput } from '@/lib/ai/provider';
import { createLanguageModel, type LanguageModel } from 'ai';

// Mock PlanOutput for testing
const mockPlanOutput = {
  modules: [
    {
      title: 'Module 1',
      description: 'First module',
      estimated_minutes: 120,
      tasks: [
        {
          title: 'Task 1',
          description: 'First task',
          estimated_minutes: 30,
          resources: [
            {
              title: 'Resource 1',
              url: 'https://example.com',
              type: 'article' as const,
            },
          ],
        },
        {
          title: 'Task 2',
          description: 'Second task',
          estimated_minutes: 45,
          resources: [
            {
              title: 'Resource 2',
              url: 'https://example.com/video',
              type: 'youtube' as const,
            },
          ],
        },
        {
          title: 'Task 3',
          description: 'Third task',
          estimated_minutes: 45,
          resources: [
            {
              title: 'Resource 3',
              url: 'https://example.com/doc',
              type: 'doc' as const,
            },
          ],
        },
      ],
    },
    {
      title: 'Module 2',
      description: 'Second module',
      estimated_minutes: 90,
      tasks: [
        {
          title: 'Task 4',
          description: 'Fourth task',
          estimated_minutes: 30,
          resources: [
            {
              title: 'Resource 4',
              url: 'https://example.com/course',
              type: 'course' as const,
            },
          ],
        },
        {
          title: 'Task 5',
          description: 'Fifth task',
          estimated_minutes: 30,
          resources: [
            {
              title: 'Resource 5',
              url: 'https://example.com/other',
              type: 'other' as const,
            },
          ],
        },
        {
          title: 'Task 6',
          description: 'Sixth task',
          estimated_minutes: 30,
          resources: [
            {
              title: 'Resource 6',
              url: 'https://example.com/article2',
              type: 'article' as const,
            },
          ],
        },
      ],
    },
    {
      title: 'Module 3',
      description: 'Third module',
      estimated_minutes: 150,
      tasks: [
        {
          title: 'Task 7',
          description: 'Seventh task',
          estimated_minutes: 50,
          resources: [
            {
              title: 'Resource 7',
              url: 'https://example.com/video2',
              type: 'youtube' as const,
            },
          ],
        },
        {
          title: 'Task 8',
          description: 'Eighth task',
          estimated_minutes: 50,
          resources: [
            {
              title: 'Resource 8',
              url: 'https://example.com/doc2',
              type: 'doc' as const,
            },
          ],
        },
        {
          title: 'Task 9',
          description: 'Ninth task',
          estimated_minutes: 50,
          resources: [
            {
              title: 'Resource 9',
              url: 'https://example.com/article3',
              type: 'article' as const,
            },
          ],
        },
      ],
    },
  ],
};

describe('buildPlanProviderResult', () => {
  const baseParams: BuildPlanProviderResultParams = {
    plan: mockPlanOutput,
    provider: 'test-provider',
    model: 'test-model',
  };

  it('returns result with stream and metadata', () => {
    const result = buildPlanProviderResult(baseParams);

    expect(result).toHaveProperty('stream');
    expect(result).toHaveProperty('metadata');
    expect(result.metadata.provider).toBe('test-provider');
    expect(result.metadata.model).toBe('test-model');
  });

  it('converts plan to async iterable stream', async () => {
    const result = buildPlanProviderResult(baseParams);

    let output = '';
    for await (const chunk of result.stream) {
      output += chunk;
    }

    const parsed = JSON.parse(output);
    expect(parsed).toEqual(mockPlanOutput);
  });

  it('includes usage metadata when provided', () => {
    const result = buildPlanProviderResult({
      ...baseParams,
      usage: {
        inputTokens: 100,
        outputTokens: 500,
        totalTokens: 600,
      },
    });

    expect(result.metadata.usage).toEqual({
      promptTokens: 100,
      completionTokens: 500,
      totalTokens: 600,
    });
  });

  it('sets undefined usage fields when usage not provided', () => {
    const result = buildPlanProviderResult(baseParams);

    expect(result.metadata.usage).toEqual({
      promptTokens: undefined,
      completionTokens: undefined,
      totalTokens: undefined,
    });
  });

  it('handles partial usage data', () => {
    const result = buildPlanProviderResult({
      ...baseParams,
      usage: {
        inputTokens: 100,
        outputTokens: undefined,
        totalTokens: undefined,
      },
    });

    expect(result.metadata.usage).toEqual({
      promptTokens: 100,
      completionTokens: undefined,
      totalTokens: undefined,
    });
  });

  it('creates valid JSON stream output', async () => {
    const result = buildPlanProviderResult(baseParams);

    let output = '';
    for await (const chunk of result.stream) {
      output += chunk;
    }

    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('preserves all plan modules in stream', async () => {
    const result = buildPlanProviderResult(baseParams);

    let output = '';
    for await (const chunk of result.stream) {
      output += chunk;
    }

    const parsed = JSON.parse(output);
    expect(parsed.modules).toHaveLength(3);
    expect(parsed.modules[0].title).toBe('Module 1');
    expect(parsed.modules[1].title).toBe('Module 2');
    expect(parsed.modules[2].title).toBe('Module 3');
  });

  it('preserves all task details in stream', async () => {
    const result = buildPlanProviderResult(baseParams);

    let output = '';
    for await (const chunk of result.stream) {
      output += chunk;
    }

    const parsed = JSON.parse(output);
    const firstModule = parsed.modules[0];
    expect(firstModule.tasks).toHaveLength(3);
    expect(firstModule.tasks[0].title).toBe('Task 1');
    expect(firstModule.tasks[0].estimated_minutes).toBe(30);
    expect(firstModule.tasks[0].resources).toHaveLength(1);
  });

  it('handles empty usage gracefully', () => {
    const result = buildPlanProviderResult({
      ...baseParams,
      usage: {} as any,
    });

    expect(result.metadata.usage).toEqual({
      promptTokens: undefined,
      completionTokens: undefined,
      totalTokens: undefined,
    });
  });

  it('creates metadata with correct structure', () => {
    const result = buildPlanProviderResult({
      ...baseParams,
      provider: 'openrouter',
      model: 'anthropic/claude-3-sonnet',
      usage: {
        inputTokens: 200,
        outputTokens: 800,
        totalTokens: 1000,
      },
    });

    expect(result.metadata).toMatchObject({
      provider: 'openrouter',
      model: 'anthropic/claude-3-sonnet',
      usage: {
        promptTokens: 200,
        completionTokens: 800,
        totalTokens: 1000,
      },
    });
  });
});

describe('generatePlanObject', () => {
  it('is tested through integration tests', () => {
    // This function requires a real LanguageModel from the ai SDK
    // and is better tested through integration tests
    // Adding a placeholder test to ensure the export is valid
    expect(generatePlanObject).toBeDefined();
    expect(typeof generatePlanObject).toBe('function');
  });
});