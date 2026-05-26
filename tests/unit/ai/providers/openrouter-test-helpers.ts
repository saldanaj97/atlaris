import type { OpenRouterClient } from '@/features/ai/providers/openrouter';
import type { GenerationInput } from '@/features/ai/types/provider.types';

import { vi } from 'vitest';

export const OPENROUTER_TEST_MODEL = 'google/gemini-2.0-flash-exp:free';

export const OPENROUTER_SAMPLE_INPUT: GenerationInput = {
  topic: 'TypeScript Fundamentals',
  notes: 'Focus on type safety',
  skillLevel: 'beginner',
  weeklyHours: 8,
  learningStyle: 'mixed',
  startDate: '2024-01-01',
  deadlineDate: '2024-03-01',
};

export const VALID_PLAN_RESPONSE = {
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

export function createOpenRouterMockClient(): {
  client: OpenRouterClient;
  send: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn();
  const client: OpenRouterClient = {
    chat: { send },
  };
  return { client, send };
}

export async function collectOpenRouterStream(
  stream: ReadableStream<string>,
): Promise<string> {
  let output = '';
  const reader = stream.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    output += value;
  }
  return output;
}
