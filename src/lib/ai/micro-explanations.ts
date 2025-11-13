/**
 * Micro-explanations generation for learning plan tasks
 * Generates concise explanations and practice exercises
 */

import { createGoogleGenerativeAI, google } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import pRetry from 'p-retry';
import { z } from 'zod';

import {
  buildMicroExplanationSystemPrompt,
  buildMicroExplanationUserPrompt,
} from '@/lib/ai/prompts';
import type { AiPlanGenerationProvider } from '@/lib/ai/provider';
import { aiMicroExplanationEnv, appEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';

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
 * Attempt micro-explanation generation with a specific provider
 */
async function tryGenerateWithProvider(
  providerName: 'google' | 'cloudflare' | 'openrouter',
  config: MicroExplanationProviderConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<MicroExplanation> {
  const modelConfig = {
    maxOutputTokens: config.maxOutputTokens,
    temperature: config.temperature,
  };

  if (providerName === 'google') {
    const apiKey = aiMicroExplanationEnv.googleApiKey;
    const provider = apiKey ? createGoogleGenerativeAI({ apiKey }) : google;

    const { object } = await generateObject({
      model: provider(config.model),
      schema: microExplanationSchema,
      system: systemPrompt,
      prompt: userPrompt,
      ...modelConfig,
    });

    return object;
  }

  if (providerName === 'cloudflare') {
    const { apiToken, apiKey, accountId, gatewayUrl } =
      aiMicroExplanationEnv.cloudflare;
    const resolvedToken = apiToken ?? apiKey;
    if (!resolvedToken) {
      throw new Error(
        'Cloudflare AI requires either apiToken or apiKey to be configured'
      );
    }
    if (!gatewayUrl && !accountId) {
      throw new Error(
        'Cloudflare AI requires a gatewayUrl or accountId to be configured'
      );
    }
    let baseURL =
      gatewayUrl ??
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/openai`;
    // Normalize Workers AI gateway URLs to OpenAI-compatible endpoint
    if (
      /gateway\.ai\.cloudflare\.com\/v1\/[^/]+\/[^/]+\/workers-ai\/?$/.test(
        baseURL
      )
    ) {
      baseURL = baseURL.replace(/\/workers-ai\/?$/, '/openai');
    }
    // Normalize model id for OpenAI-compatible endpoints
    const model = baseURL.includes('/openai')
      ? config.model.replace(/^@cf\//, '')
      : config.model;
    const openai = createOpenAI({
      apiKey: resolvedToken,
      baseURL,
    });

    const { object } = await generateObject({
      model: openai(model),
      schema: microExplanationSchema,
      system: systemPrompt,
      prompt: userPrompt,
      ...modelConfig,
    });

    return object;
  }

  if (providerName === 'openrouter') {
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
      ...modelConfig,
    });

    return object;
  }

  throw new Error(`Unknown provider: ${String(providerName)}`);
}

/**
 * Generate a micro-explanation for a task
 * Uses provider fallback logic similar to RouterGenerationProvider
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

  const config: MicroExplanationProviderConfig = {
    model: '', // Will be set per provider
    maxOutputTokens,
    temperature,
  };

  // Provider chain: Google -> Cloudflare -> OpenRouter (if enabled)
  const providers: Array<{
    name: 'google' | 'cloudflare' | 'openrouter';
    model: string;
  }> = [
    {
      name: 'google',
      model: aiMicroExplanationEnv.primaryModel,
    },
    {
      name: 'cloudflare',
      model: aiMicroExplanationEnv.fallbackModel,
    },
  ];

  if (aiMicroExplanationEnv.enableOpenRouter) {
    providers.push({
      name: 'openrouter',
      model: aiMicroExplanationEnv.overflowModel.replace(/^openrouter\//, ''),
    });
  }

  let lastError: unknown;

  for (const providerInfo of providers) {
    const providerName = providerInfo.name;
    config.model = providerInfo.model;

    if (!appEnv.isProduction) {
      logger.debug(
        {
          source: 'micro-explanation',
          event: 'provider_attempt',
          provider: providerName,
        },
        'Attempting micro-explanation provider'
      );
    }

    try {
      // Light retry on transient failures
      const explanation = await pRetry(
        () =>
          tryGenerateWithProvider(
            providerName,
            config,
            systemPrompt,
            userPrompt
          ),
        {
          retries: 1,
          minTimeout: 300,
          maxTimeout: 700,
          randomize: true,
        }
      );

      return formatMicroExplanation(explanation);
    } catch (err) {
      lastError = err;
      if (!appEnv.isProduction) {
        const message = err instanceof Error ? err.message : 'unknown error';
        logger.warn(
          {
            source: 'micro-explanation',
            event: 'provider_failed',
            provider: providerName,
            message,
          },
          'Micro-explanation provider failed'
        );
      }
      continue; // try next provider
    }
  }

  // Ensure we throw an Error object
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error('All AI providers failed to generate micro-explanation');
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
