/**
 * Micro-explanations generation for learning plan tasks
 * Generates concise explanations and practice exercises
 *
 * Uses OpenRouter as the sole AI provider (Google AI deprecated as of December 2025).
 */

import { AI_DEFAULT_MODEL } from '@/lib/ai/models';
import {
  buildMicroExplanationSystemPrompt,
  buildMicroExplanationUserPrompt,
} from '@/lib/ai/prompts';
import type { AiPlanGenerationProvider } from '@/lib/ai/provider';
import { aiMicroExplanationEnv, appEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import pRetry from 'p-retry';
import { z } from 'zod';

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
 * Provider configuration for micro-explanations
 */
interface MicroExplanationProviderConfig {
  model: string;
  maxOutputTokens: number;
  temperature: number;
}

/**
 * Generate micro-explanation using OpenRouter
 */
async function generateWithOpenRouter(
  config: MicroExplanationProviderConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<MicroExplanation> {
  const { apiKey, baseUrl, siteUrl, appName } =
    aiMicroExplanationEnv.openRouter;
  if (!apiKey) {
    throw new Error('OpenRouter API key is not configured');
  }

  const baseURL = baseUrl ?? 'https://openrouter.ai/api/v1';
  const headers: Record<string, string> = {};
  if (siteUrl) headers['HTTP-Referer'] = siteUrl;
  if (appName) headers['X-Title'] = appName;

  const openai = createOpenAI({
    apiKey,
    baseURL,
    headers,
  });

  const { object } = await generateObject({
    model: openai(config.model),
    schema: microExplanationSchema,
    system: systemPrompt,
    prompt: userPrompt,
    maxOutputTokens: config.maxOutputTokens,
    temperature: config.temperature,
  });

  return object;
}

/**
 * Generate a micro-explanation for a task
 * Uses OpenRouter as the sole AI provider.
 * @param _provider AI provider instance (kept for backwards compatibility, but not used)
 * @param args Task details for explanation generation
 * @returns Micro-explanation markdown with explanation and optional practice
 */
export async function generateMicroExplanation(
  _provider: AiPlanGenerationProvider,
  args: {
    topic: string;
    moduleTitle?: string;
    taskTitle: string;
    skillLevel: 'beginner' | 'intermediate' | 'advanced';
  }
): Promise<string> {
  const systemPrompt = buildMicroExplanationSystemPrompt();
  const userPrompt = buildMicroExplanationUserPrompt(args);

  // Configuration for micro-explanations (shorter, faster)
  const maxOutputTokens = aiMicroExplanationEnv.microExplanationMaxTokens;
  const temperature = aiMicroExplanationEnv.microExplanationTemperature;

  // Use DEFAULT_MODEL for micro-explanations (fast, free tier model)
  const config: MicroExplanationProviderConfig = {
    model: AI_DEFAULT_MODEL,
    maxOutputTokens,
    temperature,
  };

  if (!appEnv.isProduction) {
    logger.debug(
      {
        source: 'micro-explanation',
        event: 'provider_attempt',
        provider: 'openrouter',
        model: config.model,
      },
      'Attempting micro-explanation with OpenRouter'
    );
  }

  try {
    // Light retry on transient failures
    const explanation = await pRetry(
      () => generateWithOpenRouter(config, systemPrompt, userPrompt),
      {
        retries: 1,
        minTimeout: 300,
        maxTimeout: 700,
        randomize: true,
      }
    );

    return formatMicroExplanation(explanation);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    logger.warn(
      {
        source: 'micro-explanation',
        event: 'provider_failed',
        provider: 'openrouter',
        message,
      },
      'Micro-explanation provider failed'
    );

    if (err instanceof Error) {
      throw err;
    }
    throw new Error('Failed to generate micro-explanation');
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
