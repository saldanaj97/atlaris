import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GenerationInput } from '@/lib/ai/provider';
import { ProviderInvalidResponseError } from '@/lib/ai/provider';
import {
  OpenRouterProvider,
  type OpenRouterProviderConfig,
} from '@/lib/ai/providers/openrouter';

// Mock the OpenRouter SDK
const mockSend = vi.fn();
vi.mock('@openrouter/sdk', () => ({
  OpenRouter: vi.fn().mockImplementation(() => ({
    chat: {
      send: mockSend,
    },
  })),
}));

// Default test model for OpenRouter tests
const TEST_MODEL = 'google/gemini-2.0-flash-exp:free';

const SAMPLE_INPUT: GenerationInput = {
  topic: 'TypeScript Fundamentals',
  notes: 'Focus on type safety',
  skillLevel: 'beginner',
  weeklyHours: 8,
  learningStyle: 'mixed',
  startDate: '2024-01-01',
  deadlineDate: '2024-03-01',
};

const VALID_PLAN_RESPONSE = {
  modules: [
    {
      title: 'Introduction to TypeScript',
      description: 'Getting started with TypeScript basics',
      estimated_minutes: 120,
      tasks: [
        {
          title: 'Set up TypeScript environment',
          description:
            'Install TypeScript and configure your development environment',
          estimated_minutes: 30,
        },
        {
          title: 'Learn basic types',
          description: 'Understand primitive types in TypeScript',
          estimated_minutes: 45,
        },
        {
          title: 'Practice type annotations',
          description: 'Apply type annotations to variables and functions',
          estimated_minutes: 45,
        },
      ],
    },
    {
      title: 'Advanced Types',
      description: 'Deep dive into TypeScript type system',
      estimated_minutes: 180,
      tasks: [
        {
          title: 'Learn interfaces',
          description: 'Master interface declarations and usage',
          estimated_minutes: 60,
        },
        {
          title: 'Understand generics',
          description: 'Learn to write generic functions and classes',
          estimated_minutes: 60,
        },
        {
          title: 'Type guards and narrowing',
          description: 'Implement type guards for runtime type checking',
          estimated_minutes: 60,
        },
      ],
    },
    {
      title: 'TypeScript in Practice',
      description: 'Real-world TypeScript applications',
      estimated_minutes: 150,
      tasks: [
        {
          title: 'Build a CLI tool',
          description: 'Create a command-line application with TypeScript',
          estimated_minutes: 60,
        },
        {
          title: 'API integration',
          description: 'Type external APIs and handle responses',
          estimated_minutes: 45,
        },
        {
          title: 'Error handling patterns',
          description: 'Implement type-safe error handling',
          estimated_minutes: 45,
        },
      ],
    },
  ],
};

async function collectStream(stream: AsyncIterable<string>): Promise<string> {
  let output = '';
  for await (const chunk of stream) {
    output += chunk;
  }
  return output;
}

describe('OpenRouterProvider', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.OPENROUTER_API_KEY = 'test-api-key';
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('throws error when model is not provided', () => {
      expect(
        () => new OpenRouterProvider({} as OpenRouterProviderConfig)
      ).toThrow('OpenRouterProvider requires a model to be specified');
    });

    it('throws error when API key is not provided', () => {
      delete process.env.OPENROUTER_API_KEY;

      expect(() => new OpenRouterProvider({ model: TEST_MODEL })).toThrow(
        'OPENROUTER_API_KEY is not set'
      );
    });

    it('creates client with API key from environment', async () => {
      const { OpenRouter } = vi.mocked(await import('@openrouter/sdk'));

      new OpenRouterProvider({ model: TEST_MODEL });

      expect(OpenRouter).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'test-api-key',
        })
      );
    });

    it('creates client with custom config', async () => {
      const { OpenRouter } = vi.mocked(await import('@openrouter/sdk'));

      const config: OpenRouterProviderConfig = {
        apiKey: 'custom-api-key',
        siteUrl: 'https://myapp.com',
        appName: 'My App',
        model: 'anthropic/claude-3-sonnet',
        temperature: 0.5,
      };

      new OpenRouterProvider(config);

      expect(OpenRouter).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'custom-api-key',
          siteUrl: 'https://myapp.com',
          appName: 'My App',
        })
      );
    });

    it('uses custom model when specified', async () => {
      mockSend.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify(VALID_PLAN_RESPONSE),
            },
          },
        ],
      });

      const provider = new OpenRouterProvider({
        model: 'anthropic/claude-3-sonnet',
      });

      await provider.generate(SAMPLE_INPUT);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'anthropic/claude-3-sonnet',
        })
      );
    });
  });

  describe('generate', () => {
    it('generates a valid plan from string content response', async () => {
      mockSend.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify(VALID_PLAN_RESPONSE),
            },
          },
        ],
        usage: {
          promptTokens: 100,
          completionTokens: 500,
          totalTokens: 600,
        },
      });

      const provider = new OpenRouterProvider({ model: TEST_MODEL });
      const result = await provider.generate(SAMPLE_INPUT);

      const rawText = await collectStream(result.stream);
      const parsed = JSON.parse(rawText);

      expect(parsed.modules).toHaveLength(3);
      expect(parsed.modules[0].title).toBe('Introduction to TypeScript');
      expect(result.metadata.provider).toBe('openrouter');
      expect(result.metadata.model).toBe(TEST_MODEL);
    });

    it('generates a valid plan from array content response', async () => {
      mockSend.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: [
                { type: 'text', text: JSON.stringify(VALID_PLAN_RESPONSE) },
              ],
            },
          },
        ],
        usage: {
          promptTokens: 100,
          completionTokens: 500,
          totalTokens: 600,
        },
      });

      const provider = new OpenRouterProvider({ model: TEST_MODEL });
      const result = await provider.generate(SAMPLE_INPUT);

      const rawText = await collectStream(result.stream);
      const parsed = JSON.parse(rawText);

      expect(parsed.modules).toHaveLength(3);
    });

    it('returns correct usage metadata', async () => {
      mockSend.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify(VALID_PLAN_RESPONSE),
            },
          },
        ],
        usage: {
          promptTokens: 150,
          completionTokens: 750,
          totalTokens: 900,
        },
      });

      const provider = new OpenRouterProvider({ model: TEST_MODEL });
      const result = await provider.generate(SAMPLE_INPUT);

      expect(result.metadata.usage).toEqual({
        promptTokens: 150,
        completionTokens: 750,
        totalTokens: 900,
      });
    });

    it('handles missing usage data gracefully', async () => {
      mockSend.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify(VALID_PLAN_RESPONSE),
            },
          },
        ],
      });

      const provider = new OpenRouterProvider({ model: TEST_MODEL });
      const result = await provider.generate(SAMPLE_INPUT);

      expect(result.metadata.usage).toEqual({
        promptTokens: undefined,
        completionTokens: undefined,
        totalTokens: undefined,
      });
    });

    it('calls SDK with correct parameters', async () => {
      mockSend.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify(VALID_PLAN_RESPONSE),
            },
          },
        ],
      });

      const provider = new OpenRouterProvider({
        model: 'anthropic/claude-3-opus',
        temperature: 0.7,
      });

      await provider.generate(SAMPLE_INPUT);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'anthropic/claude-3-opus',
          temperature: 0.7,
          stream: false,
          responseFormat: { type: 'json_object' },
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ role: 'user' }),
          ]),
        })
      );
    });

    it('includes topic in user prompt', async () => {
      mockSend.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify(VALID_PLAN_RESPONSE),
            },
          },
        ],
      });

      const provider = new OpenRouterProvider({ model: TEST_MODEL });
      await provider.generate(SAMPLE_INPUT);

      const callArgs = mockSend.mock.calls[0][0];
      const userMessage = callArgs.messages.find(
        (m: { role: string }) => m.role === 'user'
      );

      expect(userMessage.content).toContain('TypeScript Fundamentals');
      expect(userMessage.content).toContain('beginner');
    });
  });

  describe('error handling', () => {
    it('throws ProviderInvalidResponseError when response is empty', async () => {
      // Use mockResolvedValueOnce for each assertion to make expectations explicit
      mockSend
        .mockResolvedValueOnce({
          choices: [],
        })
        .mockResolvedValueOnce({
          choices: [],
        });

      const provider = new OpenRouterProvider({ model: TEST_MODEL });

      await expect(provider.generate(SAMPLE_INPUT)).rejects.toThrow(
        ProviderInvalidResponseError
      );
      await expect(provider.generate(SAMPLE_INPUT)).rejects.toThrow(
        'OpenRouter returned an empty response'
      );
    });

    it('throws ProviderInvalidResponseError when content is null', async () => {
      mockSend.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
            },
          },
        ],
      });

      const provider = new OpenRouterProvider({ model: TEST_MODEL });

      await expect(provider.generate(SAMPLE_INPUT)).rejects.toThrow(
        ProviderInvalidResponseError
      );
    });

    it('throws ProviderInvalidResponseError when JSON is invalid', async () => {
      // Use mockResolvedValueOnce for each assertion to make expectations explicit
      mockSend
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: 'not valid json { broken',
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: 'not valid json { broken',
              },
            },
          ],
        });

      const provider = new OpenRouterProvider({ model: TEST_MODEL });

      await expect(provider.generate(SAMPLE_INPUT)).rejects.toThrow(
        ProviderInvalidResponseError
      );
      await expect(provider.generate(SAMPLE_INPUT)).rejects.toThrow(
        'OpenRouter returned invalid JSON'
      );
    });

    it('throws ProviderInvalidResponseError when schema validation fails', async () => {
      // Use mockResolvedValueOnce for each assertion to make expectations explicit
      mockSend
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: JSON.stringify({ modules: 'not an array' }),
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: JSON.stringify({ modules: 'not an array' }),
              },
            },
          ],
        });

      const provider = new OpenRouterProvider({ model: TEST_MODEL });

      await expect(provider.generate(SAMPLE_INPUT)).rejects.toThrow(
        ProviderInvalidResponseError
      );
      await expect(provider.generate(SAMPLE_INPUT)).rejects.toThrow(
        'schema validation'
      );
    });

    it('throws ProviderInvalidResponseError when modules array is empty', async () => {
      mockSend.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({ modules: [] }),
            },
          },
        ],
      });

      const provider = new OpenRouterProvider({ model: TEST_MODEL });

      await expect(provider.generate(SAMPLE_INPUT)).rejects.toThrow(
        ProviderInvalidResponseError
      );
    });

    it('throws ProviderInvalidResponseError when array content has no text items', async () => {
      // Use mockResolvedValueOnce for each assertion to make expectations explicit
      const noTextContent = {
        choices: [
          {
            message: {
              content: [
                { type: 'image', image_url: 'https://example.com/image.png' },
              ],
            },
          },
        ],
      };
      mockSend
        .mockResolvedValueOnce(noTextContent)
        .mockResolvedValueOnce(noTextContent);

      const provider = new OpenRouterProvider({ model: TEST_MODEL });

      await expect(provider.generate(SAMPLE_INPUT)).rejects.toThrow(
        ProviderInvalidResponseError
      );
      await expect(provider.generate(SAMPLE_INPUT)).rejects.toThrow(
        'no text content'
      );
    });
  });
});
