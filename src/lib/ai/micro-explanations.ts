/**
 * Micro-explanations generation for learning plan tasks
 * Generates concise explanations and practice exercises
 *
 * Uses the injected provider's config for auth; throws when provider reports unconfigured.
 */

import { AI_DEFAULT_MODEL } from '@/lib/ai/ai-models';
import {
  buildMicroExplanationSystemPrompt,
  buildMicroExplanationUserPrompt,
} from '@/lib/ai/prompts';
import { getRetryBackoffConfig } from '@/lib/ai/timeout';
import type {
  AiPlanGenerationProvider,
  MicroExplanationAuthConfig,
  MicroExplanationConfigSupplier,
} from '@/lib/ai/types/provider.types';
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
 * Create an OpenRouter-backed OpenAI client with standard headers.
 */
function createOpenRouterClient(
  apiKey: string,
  baseURL: string,
  siteUrl?: string,
  appName?: string
) {
  const headers: Record<string, string> = {};
  if (siteUrl) headers['HTTP-Referer'] = siteUrl;
  if (appName) headers['X-Title'] = appName;

  return createOpenAI({ apiKey, baseURL, headers });
}

/**
 * Generate micro-explanation using provider-supplied auth config
 */
async function generateWithOpenRouter(
  authConfig: MicroExplanationAuthConfig,
  config: MicroExplanationProviderConfig,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal
): Promise<MicroExplanation> {
  const openai = createOpenRouterClient(
    authConfig.apiKey,
    authConfig.baseUrl,
    authConfig.siteUrl,
    authConfig.appName
  );

  const { object } = await generateObject({
    model: openai(config.model),
    schema: microExplanationSchema,
    system: systemPrompt,
    prompt: userPrompt,
    maxOutputTokens: config.maxOutputTokens,
    temperature: config.temperature,
    abortSignal: signal,
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'micro-explanation',
      recordInputs: true,
      recordOutputs: true,
    },
  });

  return object;
}

/**
 * Get auth config from provider if it supports micro-explanations.
 */
function getAuthConfigFromProvider(
  provider: AiPlanGenerationProvider
): MicroExplanationAuthConfig | null {
  const supplier = provider as Partial<MicroExplanationConfigSupplier>;
  if (typeof supplier.getMicroExplanationConfig === 'function') {
    return supplier.getMicroExplanationConfig();
  }
  return null;
}

/**
 * Generate a micro-explanation for a task
 * Uses the injected provider's config for auth; throws when provider reports unconfigured.
 *
 * @param provider AI provider instance - must implement getMicroExplanationConfig when OpenRouter auth is needed
 * @param args Task details for explanation generation
 * @returns Micro-explanation markdown with explanation and optional practice
 */
export async function generateMicroExplanation(
  provider: AiPlanGenerationProvider,
  args: {
    topic: string;
    moduleTitle?: string;
    taskTitle: string;
    skillLevel: 'beginner' | 'intermediate' | 'advanced';
    signal?: AbortSignal;
  }
): Promise<string> {
  const authConfig = getAuthConfigFromProvider(provider);
  if (!authConfig?.apiKey) {
    throw new Error('OpenRouter API key is not configured');
  }

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
      () =>
        generateWithOpenRouter(
          authConfig,
          config,
          systemPrompt,
          userPrompt,
          args.signal
        ),
      {
        ...getRetryBackoffConfig(),
        retries: 1,
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
