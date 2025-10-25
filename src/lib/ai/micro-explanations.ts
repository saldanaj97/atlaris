/**
 * Micro-explanations generation for learning plan tasks
 * Generates concise explanations and practice exercises
 */

import { z } from 'zod';
import type { AiPlanGenerationProvider } from './provider';
import {
  buildMicroExplanationSystemPrompt,
  buildMicroExplanationUserPrompt,
} from './prompts';

/**
 * Schema for micro-explanation response
 */
const microExplanationSchema = z.object({
  explanation: z
    .string()
    .describe('2-3 sentence explanation of the task concept'),
  practice: z
    .string()
    .optional()
    .describe('Optional short practice exercise or question'),
});

export type MicroExplanation = z.infer<typeof microExplanationSchema>;

/**
 * Generate a micro-explanation for a task
 * @param provider AI provider instance
 * @param args Task details for explanation generation
 * @returns Micro-explanation with explanation and optional practice
 */
export async function generateMicroExplanation(
  provider: AiPlanGenerationProvider,
  args: {
    topic: string;
    moduleTitle?: string;
    taskTitle: string;
    skillLevel: 'beginner' | 'intermediate' | 'advanced';
  }
): Promise<string> {
  const _systemPrompt = buildMicroExplanationSystemPrompt();
  const _userPrompt = buildMicroExplanationUserPrompt(args);

  // Generate structured response using streamObject
  const result = await provider.generate(
    {
      topic: args.topic,
      skillLevel: args.skillLevel,
      weeklyHours: 0, // Not used for micro-explanations
      learningStyle: 'mixed', // Default for micro-explanations
    },
    {
      signal: undefined,
      timeoutMs: 10_000, // Short timeout for micro-explanations
    }
  );

  // Parse the stream for structured output
  const textParts: string[] = [];
  for await (const chunk of result.stream) {
    textParts.push(chunk);
  }

  const fullText = textParts.join('');

  // Try to parse as JSON first (if provider returns structured output)
  try {
    const parsed: unknown = JSON.parse(fullText);
    const validated = microExplanationSchema.parse(parsed);

    // Format as markdown
    let markdown = validated.explanation;
    if (validated.practice) {
      markdown += `\n\n**Practice:** ${validated.practice}`;
    }

    return markdown;
  } catch {
    // Fallback: if not structured, treat as explanation text
    return fullText.trim();
  }
}

/**
 * Generate micro-explanation markdown text from validated response
 * @param explanation Validated micro-explanation object
 * @returns Markdown formatted text
 */
export function formatMicroExplanation(explanation: MicroExplanation): string {
  let markdown = explanation.explanation;
  if (explanation.practice) {
    markdown += `\n\n**Practice:** ${explanation.practice}`;
  }
  return markdown;
}
