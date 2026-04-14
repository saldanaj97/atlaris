import {
  EnvValidationError,
  getServerOptional,
  parseEnvNumber,
  toBoolean,
} from '@/lib/config/env/shared';
import { AI_DEFAULT_MODEL, isValidModelId } from '@/shared/constants/ai-models';
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

export const aiEnv = {
  get provider(): string | undefined {
    const raw = getServerOptional('AI_PROVIDER');
    return raw?.toLowerCase();
  },
  /**
   * Whether `AI_USE_MOCK` explicitly enables mock AI providers.
   * Parses trimmed, case-insensitive truthy values (`true`/`1`) to `true`.
   */
  get useMock(): boolean {
    return toBoolean(getServerOptional('AI_USE_MOCK'), false);
  },
  get mockSeed(): number | undefined {
    return parseEnvNumber(getServerOptional('MOCK_GENERATION_SEED'));
  },
  /**
   * Named mock scenario for local product testing (mock provider only).
   * Unset or `success` uses default success-path behavior with optional failureRate.
   */
  get mockScenario(): string | undefined {
    const raw = getServerOptional('MOCK_AI_SCENARIO')?.trim().toLowerCase();
    if (!raw || raw === 'success') {
      return undefined;
    }
    if (!MOCK_AI_SCENARIO_VALUES.has(raw)) {
      throw new EnvValidationError(
        `MOCK_AI_SCENARIO must be one of: ${[...MOCK_AI_SCENARIO_VALUES].join(', ')}`,
        'MOCK_AI_SCENARIO'
      );
    }
    return raw;
  },
  mock: {
    get delayMs(): number | undefined {
      return parseEnvNumber(getServerOptional('MOCK_GENERATION_DELAY_MS'));
    },
    get failureRate(): number | undefined {
      const raw = getServerOptional('MOCK_GENERATION_FAILURE_RATE');
      const parsed = parseEnvNumber(raw);

      if (raw === undefined) {
        return undefined;
      }

      if (parsed === undefined || parsed < 0 || parsed > 1) {
        throw new EnvValidationError(
          'MOCK_GENERATION_FAILURE_RATE must be a finite number between 0 and 1',
          'MOCK_GENERATION_FAILURE_RATE'
        );
      }

      return parsed;
    },
  },
  /**
   * Default AI model for plan generation.
   * AI_DEFAULT_MODEL env var overrides the hardcoded default from ai-models.ts.
   */
  get defaultModel(): string {
    const configured = getServerOptional('AI_DEFAULT_MODEL');
    if (!configured) {
      return AI_DEFAULT_MODEL;
    }

    if (!isValidModelId(configured)) {
      throw new EnvValidationError(
        `AI_DEFAULT_MODEL must be one of AVAILABLE_MODELS ids. Received: ${configured}`,
        'AI_DEFAULT_MODEL'
      );
    }

    return configured;
  },
} as const;

export const aiTimeoutEnv = {
  get baseMs(): number {
    return parseEnvNumber(getServerOptional('AI_TIMEOUT_BASE_MS'), 120_000);
  },
  get extensionMs(): number {
    return parseEnvNumber(getServerOptional('AI_TIMEOUT_EXTENSION_MS'), 60_000);
  },
  get extensionThresholdMs(): number {
    const override = parseEnvNumber(
      getServerOptional('AI_TIMEOUT_EXTENSION_THRESHOLD_MS')
    );
    if (override !== undefined) {
      return override;
    }
    const base = this.baseMs;
    return Math.max(0, base - 5_000);
  },
} as const;

const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * OpenRouter API configuration.
 * Provides API key, base URL, and HTTP headers for the OpenRouter service.
 */
export const openRouterEnv = {
  get apiKey(): string | undefined {
    return getServerOptional('OPENROUTER_API_KEY');
  },
  get siteUrl(): string | undefined {
    return getServerOptional('OPENROUTER_SITE_URL');
  },
  get appName(): string | undefined {
    return getServerOptional('OPENROUTER_APP_NAME');
  },
  /** Base URL for OpenRouter API, defaults to official endpoint */
  get baseUrl(): string {
    return (
      getServerOptional('OPENROUTER_BASE_URL') ?? OPENROUTER_DEFAULT_BASE_URL
    );
  },
} as const;

export const attemptsEnv = {
  get cap(): number {
    return parseEnvNumber(
      getServerOptional('ATTEMPT_CAP'),
      DEFAULT_ATTEMPT_CAP
    );
  },
} as const;

/** Resolved at import time via `resolveAttemptCap(attemptsEnv.cap)`. */
export const ATTEMPT_CAP = resolveAttemptCap(attemptsEnv.cap);
