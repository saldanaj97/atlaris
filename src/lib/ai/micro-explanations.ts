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
} from './prompts';
import type { AiPlanGenerationProvider } from './provider';

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
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
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
    const apiToken = process.env.CF_API_TOKEN ?? process.env.CF_API_KEY;
    if (!apiToken) {
      throw new Error('CF_API_TOKEN is not set');
    }

    const accountId = process.env.CF_ACCOUNT_ID;
    const gatewayUrl = process.env.CF_AI_GATEWAY;
    const rawBaseURL =
      gatewayUrl ||
      (accountId
        ? `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/openai`
        : undefined);

    let baseURL =
      rawBaseURL ??
      'https://api.cloudflare.com/client/v4/accounts/undefined/ai/v1/openai';

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
      apiKey: apiToken,
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
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not set');
    }

    const baseURL =
      process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
    const headers: Record<string, string> = {};
    const siteUrl = process.env.OPENROUTER_SITE_URL;
    const appName = process.env.OPENROUTER_APP_NAME;
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
  const maxOutputTokens = parseInt(
    process.env.AI_MICRO_EXPLANATION_MAX_TOKENS ?? '200',
    10
  );
  const temperature = parseFloat(
    process.env.AI_MICRO_EXPLANATION_TEMPERATURE ?? '0.4'
  );

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
      model: process.env.AI_PRIMARY ?? 'gemini-1.5-flash',
    },
    {
      name: 'cloudflare',
      model: process.env.AI_FALLBACK ?? '@cf/meta/llama-3.1-8b-instruct',
    },
  ];

  if (process.env.AI_ENABLE_OPENROUTER === 'true') {
    providers.push({
      name: 'openrouter',
      model: (process.env.AI_OVERFLOW ?? 'google/gemini-2.0-pro-exp').replace(
        /^openrouter\//,
        ''
      ),
    });
  }

  let lastError: unknown;

  for (const providerInfo of providers) {
    const providerName = providerInfo.name;
    config.model = providerInfo.model;

    if (process.env.NODE_ENV !== 'production') {
      console.info(
        JSON.stringify({
          source: 'micro-explanation',
          level: 'info',
          event: 'provider_attempt',
          provider: providerName,
        })
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
      if (process.env.NODE_ENV !== 'production') {
        const message = err instanceof Error ? err.message : 'unknown error';
        console.warn(
          JSON.stringify({
            source: 'micro-explanation',
            level: 'warn',
            event: 'provider_failed',
            provider: providerName,
            message,
          })
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
