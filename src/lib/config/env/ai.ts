import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  createServerEnvAccess,
  EnvValidationError,
  getProcessEnvSource,
  parseEnvNumber,
  type ServerEnvAccess,
} from '@/lib/config/env/shared';
import { AI_DEFAULT_MODEL, isModelIdShape } from '@/shared/constants/ai-models';
import {
  DEFAULT_ATTEMPT_CAP,
  resolveAttemptCap,
} from '@/shared/constants/generation';

const MOCK_AI_SCENARIO_VALUES = new Set([
  'success',
  'timeout',
  'provider_error',
  'invalid_response',
  'rate_limit',
]);

const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

/** Per-tier OpenRouter keys; each falls back to `OPENROUTER_API_KEY`. */
const OPENROUTER_TIER_API_KEY_NAMES = {
  free: 'OPENROUTER_API_KEY_FREE',
  starter: 'OPENROUTER_API_KEY_STARTER',
  pro: 'OPENROUTER_API_KEY_PRO',
} as const satisfies Record<SubscriptionTier, string>;

/** Worker modes whose AI Gateway logs may keep prompt and response bodies. */
const AI_GATEWAY_PAYLOAD_LOG_WORKER_ENVS = new Set(['staging', 'development']);

/**
 * Mock-provider-specific env flags used by AI generation tests and local flows.
 */
interface AiMockEnv {
  readonly delayMs: number | undefined;
  readonly failureRate: number | undefined;
}

/**
 * Accepted values for `AI_PROVIDER`. Historically the env accepted any
 * string and treated everything except `mock` as "use the real router";
 * tighten to this fixed union so unintended typos surface at parse time.
 */
type AiProviderEnvValue = 'mock' | 'router';

/**
 * Core AI env facets used by provider selection and generation defaults.
 */
interface AiEnvConfig {
  readonly provider: AiProviderEnvValue | undefined;
  readonly mockSeed: number | undefined;
  readonly mockScenario: string | undefined;
  readonly mock: AiMockEnv;
  readonly defaultModel: string;
}

/**
 * Timeout-related AI env values derived from the shared server env source.
 */
interface AiTimeoutEnv {
  readonly baseMs: number;
  readonly extensionMs: number;
  readonly extensionThresholdMs: number;
}

/**
 * OpenRouter request configuration exposed through env accessors.
 */
interface OpenRouterEnv {
  readonly apiKey: string | undefined;
  /**
   * The tier's key (`OPENROUTER_API_KEY_<TIER>`), else `OPENROUTER_API_KEY`.
   * Without a tier, `OPENROUTER_API_KEY`.
   */
  apiKeyForTier(tier?: SubscriptionTier): string | undefined;
  /**
   * Only `OPENROUTER_API_KEY_<TIER>`, with no fallback: the tier's model list
   * comes from that key's guardrail, so another key would list the wrong models.
   */
  guardrailKeyForTier(tier: SubscriptionTier): string | undefined;
  readonly siteUrl: string | undefined;
  readonly appName: string | undefined;
  readonly baseUrl: string;
  /** OpenRouter preset slug holding the plan-generation system prompt. */
  readonly planPreset: string | undefined;
  /** OpenRouter preset slug holding the lesson-generation system prompt. */
  readonly lessonPreset: string | undefined;
  /** Cloudflare AI Gateway token, sent when `baseUrl` points at the gateway. */
  readonly aiGatewayToken: string | undefined;
  /**
   * Whether AI Gateway logs keep request and response bodies. Only staging and
   * local Worker modes do; production logs metadata only (prompts hold user notes).
   */
  readonly aiGatewayLogPayloads: boolean;
}

/**
 * Attempt-cap env values used to normalize generation retry limits.
 */
interface AttemptsEnv {
  readonly cap: number;
}

/**
 * Grouped AI env facets built from a shared server env access helper.
 */
interface AiEnvFacets {
  readonly aiEnv: AiEnvConfig;
  readonly aiTimeoutEnv: AiTimeoutEnv;
  readonly openRouterEnv: OpenRouterEnv;
  readonly attemptsEnv: AttemptsEnv;
}

function getAiTimeoutBaseMs(access: ServerEnvAccess): number {
  return parseEnvNumber(
    access.getServerOptional('AI_TIMEOUT_BASE_MS'),
    120_000,
  );
}

export function createAiEnvFacets(access: ServerEnvAccess): AiEnvFacets {
  const aiEnv: AiEnvConfig = {
    get provider() {
      const raw = access.getServerOptional('AI_PROVIDER');
      if (raw === undefined) return undefined;
      const normalized = raw.trim().toLowerCase();
      if (normalized === '') return undefined;
      if (normalized === 'mock' || normalized === 'router') {
        return normalized;
      }
      throw new EnvValidationError(
        `AI_PROVIDER must be one of: mock, router (or unset to use environment defaults). Received: ${raw}`,
        'AI_PROVIDER',
      );
    },
    get mockSeed() {
      return parseEnvNumber(access.getServerOptional('MOCK_GENERATION_SEED'));
    },
    /**
     * Named mock scenario for local product testing (mock provider only).
     * Unset or `success` uses default success-path behavior with optional failureRate.
     */
    get mockScenario(): string | undefined {
      const raw = access
        .getServerOptional('MOCK_AI_SCENARIO')
        ?.trim()
        .toLowerCase();
      if (!raw || raw === 'success') {
        return undefined;
      }
      if (!MOCK_AI_SCENARIO_VALUES.has(raw)) {
        throw new EnvValidationError(
          `MOCK_AI_SCENARIO must be one of: ${[...MOCK_AI_SCENARIO_VALUES].join(', ')}`,
          'MOCK_AI_SCENARIO',
        );
      }
      return raw;
    },
    mock: {
      get delayMs() {
        return parseEnvNumber(
          access.getServerOptional('MOCK_GENERATION_DELAY_MS'),
        );
      },
      get failureRate() {
        return parseEnvNumber(
          access.getServerOptional('MOCK_GENERATION_FAILURE_RATE'),
        );
      },
    },
    /**
     * Model for providers built without a tier (`getGenerationProvider`).
     * AI_DEFAULT_MODEL overrides `openrouter/free`. The tier model lists are
     * synced from OpenRouter guardrails at runtime, so this checks only the
     * slug's shape; OpenRouter rejects a model the key's guardrail blocks.
     */
    get defaultModel() {
      const configured = access.getServerOptional('AI_DEFAULT_MODEL');
      if (!configured) {
        return AI_DEFAULT_MODEL;
      }

      if (!isModelIdShape(configured)) {
        throw new EnvValidationError(
          `AI_DEFAULT_MODEL must be an OpenRouter model slug like "vendor/model". Received: ${configured}`,
          'AI_DEFAULT_MODEL',
        );
      }

      return configured;
    },
  };

  const aiTimeoutEnv: AiTimeoutEnv = {
    get baseMs() {
      return getAiTimeoutBaseMs(access);
    },
    get extensionMs() {
      return parseEnvNumber(
        access.getServerOptional('AI_TIMEOUT_EXTENSION_MS'),
        60_000,
      );
    },
    get extensionThresholdMs() {
      const override = parseEnvNumber(
        access.getServerOptional('AI_TIMEOUT_EXTENSION_THRESHOLD_MS'),
      );
      if (override !== undefined) {
        return override;
      }
      const base = getAiTimeoutBaseMs(access);
      return Math.max(0, base - 5_000);
    },
  };

  /**
   * OpenRouter API configuration.
   * Provides API key, base URL, and HTTP headers for the OpenRouter service.
   */
  const openRouterEnv: OpenRouterEnv = {
    get apiKey() {
      return access.getServerOptional('OPENROUTER_API_KEY');
    },
    apiKeyForTier(tier) {
      const tierKey =
        tier === undefined
          ? undefined
          : access.getServerOptional(OPENROUTER_TIER_API_KEY_NAMES[tier]);
      return tierKey ?? access.getServerOptional('OPENROUTER_API_KEY');
    },
    guardrailKeyForTier(tier) {
      return access.getServerOptional(OPENROUTER_TIER_API_KEY_NAMES[tier]);
    },
    get siteUrl() {
      return access.getServerOptional('OPENROUTER_SITE_URL');
    },
    get appName() {
      return access.getServerOptional('OPENROUTER_APP_NAME');
    },
    /** Base URL for OpenRouter API, defaults to official endpoint */
    get baseUrl() {
      return (
        access.getServerOptional('OPENROUTER_BASE_URL') ??
        OPENROUTER_DEFAULT_BASE_URL
      );
    },
    get planPreset() {
      return access.getServerOptional('OPENROUTER_PLAN_PRESET');
    },
    get lessonPreset() {
      return access.getServerOptional('OPENROUTER_LESSON_PRESET');
    },
    get aiGatewayToken() {
      return access.getServerOptional('CF_AI_GATEWAY_TOKEN');
    },
    get aiGatewayLogPayloads() {
      const workerEnv = access.getServerOptional('WORKER_ENV');
      return (
        workerEnv !== undefined &&
        AI_GATEWAY_PAYLOAD_LOG_WORKER_ENVS.has(workerEnv)
      );
    },
  };

  const attemptsEnv: AttemptsEnv = {
    get cap() {
      return parseEnvNumber(
        access.getServerOptional('ATTEMPT_CAP'),
        DEFAULT_ATTEMPT_CAP,
      );
    },
  };

  return {
    aiEnv,
    aiTimeoutEnv,
    openRouterEnv,
    attemptsEnv,
  };
}

const defaultAiAccess = createServerEnvAccess(getProcessEnvSource);
const defaultAiFacets = createAiEnvFacets(defaultAiAccess);

export const aiEnv = defaultAiFacets.aiEnv;
export const aiTimeoutEnv = defaultAiFacets.aiTimeoutEnv;
export const openRouterEnv = defaultAiFacets.openRouterEnv;

/** Per-plan generation attempt cap (env-overridable, validated >= 1). */
export function getAttemptCap(): number {
  return resolveAttemptCap(defaultAiFacets.attemptsEnv.cap);
}
