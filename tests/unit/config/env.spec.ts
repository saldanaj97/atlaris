import { AI_DEFAULT_MODEL, AVAILABLE_MODELS } from '@/features/ai/ai-models';
import {
  aiEnv,
  appEnv,
  createClerkAuthEnv,
  createAiEnvFacets,
  createAppEnv,
  createLessonContentEnvForTests,
  createMaintenanceEnvForTests,
  createWorkflowEnvForTests,
  createServerEnvAccess,
  createSupabasePublicEnv,
  EnvValidationError,
  assertHostedDeployForbiddenFlags,
  optionalEnv,
  parseEnvNumber,
  parseNodeEnv,
  readWorkflowCallbackTokenConfig,
  regenerationQueueEnv,
  requireEnv,
  sentryEnv,
  toBoolean,
  workflowEnv,
} from '@/lib/config/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Environment Configuration', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('parseNodeEnv (pure)', () => {
    it('defaults to development when NODE_ENV is unset', () => {
      expect(parseNodeEnv({})).toBe('development');
    });

    it('accepts development, production, test', () => {
      expect(parseNodeEnv({ NODE_ENV: 'production' })).toBe('production');
      expect(parseNodeEnv({ NODE_ENV: 'test' })).toBe('test');
      expect(parseNodeEnv({ NODE_ENV: 'development' })).toBe('development');
    });

    it('throws EnvValidationError for invalid NODE_ENV', () => {
      expect(() => parseNodeEnv({ NODE_ENV: 'staging' })).toThrow(
        EnvValidationError,
      );
    });
  });

  describe('createAppEnv (pure)', () => {
    it('derives flags from injected env + access', () => {
      const env = {
        NODE_ENV: 'test',
        APP_URL: 'http://localhost:3000',
      } as const;
      const access = createServerEnvAccess(() => env);
      const app = createAppEnv(env, access);

      expect(app.nodeEnv).toBe('test');
      expect(app.isTest).toBe(true);
      expect(app.isProduction).toBe(false);
      expect(app.url).toBe('http://localhost:3000');
    });

    it('requires https APP_URL in production', () => {
      const env = {
        NODE_ENV: 'production',
        APP_URL: 'http://example.com',
      } as const;
      const access = createServerEnvAccess(() => env);
      const app = createAppEnv(env, access);

      expect(() => app.url).toThrow(EnvValidationError);
    });
  });

  describe('createClerkAuthEnv (pure)', () => {
    it('parses valid Clerk config', () => {
      const parsed = createClerkAuthEnv({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_example',
        CLERK_SECRET_KEY: 'sk_test_example',
      });

      expect(parsed.publishableKey).toBe('pk_test_example');
      expect(parsed.secretKey).toBe('sk_test_example');
    });

    it('aggregates known validation issues into one error', () => {
      expect(() =>
        createClerkAuthEnv({
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'bad-public-key',
          CLERK_SECRET_KEY: 'bad-secret-key',
        }),
      ).toThrow(
        /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must start with pk_test_ or pk_live_; CLERK_SECRET_KEY: CLERK_SECRET_KEY must start with sk_test_ or sk_live_/,
      );
    });
  });

  describe('hosted deploy forbidden flags', () => {
    it('allows local production preview builds to keep local product-testing flags in .env.local', () => {
      expect(() =>
        assertHostedDeployForbiddenFlags({
          NODE_ENV: 'production',
          LOCAL_PRODUCT_TESTING: 'true',
          STRIPE_LOCAL_MODE: 'true',
        }),
      ).not.toThrow();
    });

    it('rejects local-only flags in hosted deploy environments', () => {
      expect(() =>
        assertHostedDeployForbiddenFlags({
          NODE_ENV: 'production',
          VERCEL: '1',
          LOCAL_PRODUCT_TESTING: 'true',
        }),
      ).toThrow(/LOCAL_PRODUCT_TESTING cannot be enabled in production/);

      expect(() =>
        assertHostedDeployForbiddenFlags({
          NODE_ENV: 'production',
          VERCEL: '1',
          STRIPE_LOCAL_MODE: 'true',
        }),
      ).toThrow(/STRIPE_LOCAL_MODE cannot be enabled in production/);
    });
  });

  describe('createSupabasePublicEnv (pure)', () => {
    it('parses valid Supabase public config', () => {
      const parsed = createSupabasePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
      });

      expect(parsed.url).toBe('https://example.supabase.co');
      expect(parsed.publishableKey).toBe('sb_publishable_example');
    });

    it('reports invalid Supabase URL with the env key', () => {
      expect(() =>
        createSupabasePublicEnv({
          NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
        }),
      ).toThrow(
        /NEXT_PUBLIC_SUPABASE_URL: NEXT_PUBLIC_SUPABASE_URL must be a valid URL/,
      );
    });
  });

  describe('createAiEnvFacets (pure)', () => {
    it('reads attempt cap from injected source', () => {
      const env = { ATTEMPT_CAP: '5' } as const;
      const access = createServerEnvAccess(() => env);
      const { attemptsEnv } = createAiEnvFacets(access);

      expect(attemptsEnv.cap).toBe(5);
    });

    it('coerces AI_USE_MOCK to booleans', () => {
      const env = { AI_USE_MOCK: '0' } as const;
      const access = createServerEnvAccess(() => env);
      const { aiEnv } = createAiEnvFacets(access);

      expect(aiEnv.useMock).toBe(false);
    });

    it.each([
      ['true', true],
      ['1', true],
      ['false', false],
      ['0', false],
    ] as const)('strictly parses AI_USE_MOCK=%s', (value, expected) => {
      const env = { AI_USE_MOCK: value } as const;
      const access = createServerEnvAccess(() => env);
      const { aiEnv } = createAiEnvFacets(access);

      expect(aiEnv.useMock).toBe(expected);
    });

    it('rejects malformed AI_USE_MOCK values', () => {
      const env = { AI_USE_MOCK: 'maybe' } as const;
      const access = createServerEnvAccess(() => env);
      const { aiEnv } = createAiEnvFacets(access);

      expect(() => aiEnv.useMock).toThrow(
        /AI_USE_MOCK must be one of: true, false, 1, 0/,
      );
    });

    it('derives the timeout threshold from the same base logic', () => {
      const env = { AI_TIMEOUT_BASE_MS: '7000' } as const;
      const access = createServerEnvAccess(() => env);
      const { aiTimeoutEnv } = createAiEnvFacets(access);

      expect(aiTimeoutEnv.baseMs).toBe(7000);
      expect(aiTimeoutEnv.extensionThresholdMs).toBe(2000);
    });
  });

  describe('createLessonContentEnvForTests (pure)', () => {
    it.each([
      ['development', undefined, true],
      ['development', '', true],
      ['production', undefined, false],
      ['production', '', false],
    ] as const)(
      'defaults generationEnabled to %s when LESSON_GENERATION_ENABLED is %s',
      (nodeEnv, value, expected) => {
        vi.stubEnv('NODE_ENV', nodeEnv);
        if (nodeEnv === 'production') {
          vi.stubGlobal('window', undefined);
        }
        const env = {
          NODE_ENV: nodeEnv,
          LESSON_GENERATION_ENABLED: value,
        } as const;
        const access = createServerEnvAccess(() => env);
        const lesson = createLessonContentEnvForTests(access);

        expect(lesson.generationEnabled).toBe(expected);
      },
    );

    it.each([
      ['true', true],
      ['1', true],
      ['false', false],
      ['0', false],
    ] as const)('parses LESSON_GENERATION_ENABLED=%s', (value, expected) => {
      vi.stubEnv('NODE_ENV', 'production');
      const env = {
        LESSON_GENERATION_ENABLED: value,
      } as const;
      const access = createServerEnvAccess(() => env);
      const lesson = createLessonContentEnvForTests(access);

      expect(lesson.generationEnabled).toBe(expected);
    });

    it('rejects invalid LESSON_GENERATION_ENABLED with envKey', () => {
      vi.stubEnv('NODE_ENV', 'production');
      const env = {
        LESSON_GENERATION_ENABLED: 'maybe',
      } as const;
      const access = createServerEnvAccess(() => env);
      const lesson = createLessonContentEnvForTests(access);

      let caughtError: unknown;
      try {
        void lesson.generationEnabled;
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBeInstanceOf(EnvValidationError);
      expect((caughtError as EnvValidationError).envKey).toBe(
        'LESSON_GENERATION_ENABLED',
      );
    });
  });

  describe('optionalEnv', () => {
    it('should return value for defined environment variable', () => {
      vi.stubEnv('TEST_VAR', 'test-value');

      expect(optionalEnv('TEST_VAR')).toBe('test-value');
    });

    it('should return undefined for missing environment variable', () => {
      expect(optionalEnv('TEST_VAR')).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      vi.stubEnv('TEST_VAR', '');

      expect(optionalEnv('TEST_VAR')).toBeUndefined();
    });

    it('should return undefined for whitespace-only string', () => {
      vi.stubEnv('TEST_VAR', '   ');

      expect(optionalEnv('TEST_VAR')).toBeUndefined();
    });

    it('should trim whitespace from value', () => {
      vi.stubEnv('TEST_VAR', '  test-value  ');

      expect(optionalEnv('TEST_VAR')).toBe('test-value');
    });
  });

  describe('requireEnv', () => {
    it('should return value for defined environment variable', () => {
      vi.stubEnv('REQUIRED_VAR', 'required-value');

      expect(requireEnv('REQUIRED_VAR')).toBe('required-value');
    });

    it('should throw EnvValidationError for missing environment variable', () => {
      expect(() => requireEnv('REQUIRED_VAR')).toThrow(EnvValidationError);
      expect(() => requireEnv('REQUIRED_VAR')).toThrow(
        'Missing required environment variable: REQUIRED_VAR',
      );
    });

    it('should throw EnvValidationError for empty string', () => {
      vi.stubEnv('REQUIRED_VAR', '');

      expect(() => requireEnv('REQUIRED_VAR')).toThrow(EnvValidationError);
      expect(() => requireEnv('REQUIRED_VAR')).toThrow(
        'Missing required environment variable: REQUIRED_VAR',
      );
    });

    it('should throw EnvValidationError for whitespace-only string', () => {
      vi.stubEnv('REQUIRED_VAR', '   ');

      expect(() => requireEnv('REQUIRED_VAR')).toThrow(EnvValidationError);
      expect(() => requireEnv('REQUIRED_VAR')).toThrow(
        'Missing required environment variable: REQUIRED_VAR',
      );
    });

    it('should set envKey property on EnvValidationError', () => {
      try {
        requireEnv('REQUIRED_VAR');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EnvValidationError);
        expect((error as EnvValidationError).envKey).toBe('REQUIRED_VAR');
      }
    });

    it('should trim whitespace from value', () => {
      vi.stubEnv('REQUIRED_VAR', '  required-value  ');

      expect(requireEnv('REQUIRED_VAR')).toBe('required-value');
    });
  });

  describe('appEnv (process-bound defaults)', () => {
    describe('nodeEnv', () => {
      it('should return "development" by default', () => {
        Reflect.deleteProperty(process.env, 'NODE_ENV');

        expect(appEnv.nodeEnv).toBe('development');
      });

      it('should return "production" when set', () => {
        vi.stubEnv('NODE_ENV', 'production');

        expect(appEnv.nodeEnv).toBe('production');
      });

      it('should return "test" when set', () => {
        vi.stubEnv('NODE_ENV', 'test');

        expect(appEnv.nodeEnv).toBe('test');
      });
    });

    describe('isProduction', () => {
      it('should return true when NODE_ENV is production', () => {
        vi.stubEnv('NODE_ENV', 'production');

        expect(appEnv.isProduction).toBe(true);
      });

      it('should return false when NODE_ENV is development', () => {
        vi.stubEnv('NODE_ENV', 'development');

        expect(appEnv.isProduction).toBe(false);
      });

      it('should return false when NODE_ENV is test', () => {
        vi.stubEnv('NODE_ENV', 'test');

        expect(appEnv.isProduction).toBe(false);
      });
    });

    describe('isDevelopment', () => {
      it('should return true when NODE_ENV is development', () => {
        vi.stubEnv('NODE_ENV', 'development');

        expect(appEnv.isDevelopment).toBe(true);
      });

      it('should return false when NODE_ENV is production', () => {
        vi.stubEnv('NODE_ENV', 'production');

        expect(appEnv.isDevelopment).toBe(false);
      });

      it('should return false when NODE_ENV is test', () => {
        vi.stubEnv('NODE_ENV', 'test');

        expect(appEnv.isDevelopment).toBe(false);
      });

      it('should return true by default (when NODE_ENV is undefined)', () => {
        Reflect.deleteProperty(process.env, 'NODE_ENV');

        expect(appEnv.isDevelopment).toBe(true);
      });
    });

    describe('isTest', () => {
      it('should return true when NODE_ENV is test', () => {
        vi.stubEnv('NODE_ENV', 'test');

        expect(appEnv.isTest).toBe(true);
      });

      it('should return true when VITEST_WORKER_ID is set', () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('VITEST_WORKER_ID', '1');

        expect(appEnv.isTest).toBe(true);
      });

      it('should return false when neither NODE_ENV is test nor VITEST_WORKER_ID is set', () => {
        vi.stubEnv('NODE_ENV', 'development');
        Reflect.deleteProperty(process.env, 'VITEST_WORKER_ID');

        expect(appEnv.isTest).toBe(false);
      });
    });

    describe('vitestWorkerId', () => {
      it('should return VITEST_WORKER_ID when set', () => {
        vi.stubEnv('VITEST_WORKER_ID', '2');

        expect(appEnv.vitestWorkerId).toBe('2');
      });

      it('should return undefined when not set', () => {
        Reflect.deleteProperty(process.env, 'VITEST_WORKER_ID');

        expect(appEnv.vitestWorkerId).toBeUndefined();
      });
    });

    describe('maintenanceMode', () => {
      it('should return false when MAINTENANCE_MODE is unset', () => {
        expect(appEnv.maintenanceMode).toBe(false);
      });

      it('should return true when MAINTENANCE_MODE is true (case-insensitive)', () => {
        vi.stubEnv('MAINTENANCE_MODE', 'TRUE');

        expect(appEnv.maintenanceMode).toBe(true);
      });

      it('should return true when MAINTENANCE_MODE is lowercase true', () => {
        vi.stubEnv('MAINTENANCE_MODE', 'true');

        expect(appEnv.maintenanceMode).toBe(true);
      });

      it('should return true when MAINTENANCE_MODE is 1', () => {
        vi.stubEnv('MAINTENANCE_MODE', '1');

        expect(appEnv.maintenanceMode).toBe(true);
      });

      it('should return false for other non-truthy strings', () => {
        vi.stubEnv('MAINTENANCE_MODE', 'false');

        expect(appEnv.maintenanceMode).toBe(false);
      });
    });
  });

  describe('sentryEnv', () => {
    it('defaults sendDefaultPii to false when unset', () => {
      expect(sentryEnv.sendDefaultPii).toBe(false);
    });

    it.each([
      ['true', true],
      ['TRUE', true],
      ['1', true],
      ['false', false],
      ['0', false],
    ] as const)('parses SENTRY_SEND_DEFAULT_PII=%s', (value, expected) => {
      vi.stubEnv('SENTRY_SEND_DEFAULT_PII', value);
      expect(sentryEnv.sendDefaultPii).toBe(expected);
    });
  });

  describe('Sentry init config modules', () => {
    it('server and edge default sendDefaultPii to false when unset', async () => {
      vi.resetModules();
      vi.unstubAllEnvs();
      const initOptions: Array<Record<string, unknown>> = [];
      vi.doMock('@sentry/nextjs', () => ({
        init: (options: Record<string, unknown>) => {
          initOptions.push(options);
        },
        pinoIntegration: () => ({}),
        vercelAIIntegration: () => ({}),
      }));
      vi.doMock('@/lib/observability/sampling', () => ({
        shouldEnableLogs: () => false,
        tracesSampler: () => 0,
      }));
      vi.doMock('@/lib/observability/sentry-filters', () => ({
        beforeSendSentryEvent: (event: unknown) => event,
      }));

      await import('../../../sentry.server.config');
      await import('../../../sentry.edge.config');

      expect(initOptions).toHaveLength(2);
      expect(initOptions.every((opts) => opts.sendDefaultPii === false)).toBe(
        true,
      );
    });

    it('server and edge enable sendDefaultPii when SENTRY_SEND_DEFAULT_PII is truthy', async () => {
      vi.resetModules();
      vi.stubEnv('SENTRY_SEND_DEFAULT_PII', 'true');
      const initOptions: Array<Record<string, unknown>> = [];
      vi.doMock('@sentry/nextjs', () => ({
        init: (options: Record<string, unknown>) => {
          initOptions.push(options);
        },
        pinoIntegration: () => ({}),
        vercelAIIntegration: () => ({}),
      }));
      vi.doMock('@/lib/observability/sampling', () => ({
        shouldEnableLogs: () => false,
        tracesSampler: () => 0,
      }));
      vi.doMock('@/lib/observability/sentry-filters', () => ({
        beforeSendSentryEvent: (event: unknown) => event,
      }));

      await import('../../../sentry.server.config');
      await import('../../../sentry.edge.config');

      expect(initOptions).toHaveLength(2);
      expect(initOptions.every((opts) => opts.sendDefaultPii === true)).toBe(
        true,
      );
    });
  });

  describe('aiEnv', () => {
    describe('defaultModel', () => {
      const validModelId = AVAILABLE_MODELS[0]?.id ?? AI_DEFAULT_MODEL;

      it('should return configured value when AI_DEFAULT_MODEL is valid', () => {
        vi.stubEnv('AI_DEFAULT_MODEL', validModelId);

        expect(aiEnv.defaultModel).toBe(validModelId);
      });

      it('should return fallback when AI_DEFAULT_MODEL is not set', () => {
        expect(aiEnv.defaultModel).toBe(AI_DEFAULT_MODEL);
      });

      it('should return fallback when AI_DEFAULT_MODEL is empty', () => {
        vi.stubEnv('AI_DEFAULT_MODEL', '');

        expect(aiEnv.defaultModel).toBe(AI_DEFAULT_MODEL);
      });

      it('should return fallback when AI_DEFAULT_MODEL is whitespace', () => {
        vi.stubEnv('AI_DEFAULT_MODEL', '   ');

        expect(aiEnv.defaultModel).toBe(AI_DEFAULT_MODEL);
      });

      it('should throw when AI_DEFAULT_MODEL is not in AVAILABLE_MODELS', () => {
        vi.stubEnv('AI_DEFAULT_MODEL', 'invalid/nonexistent-model-xyz');

        expect(() => aiEnv.defaultModel).toThrow(EnvValidationError);
        expect(() => aiEnv.defaultModel).toThrow(
          /AI_DEFAULT_MODEL must be one of AVAILABLE_MODELS ids/,
        );
      });
    });

    describe('provider', () => {
      it('should return normalized lowercase mock value', () => {
        vi.stubEnv('AI_PROVIDER', 'MOCK');

        expect(aiEnv.provider).toBe('mock');
      });

      it('should return normalized lowercase router value', () => {
        vi.stubEnv('AI_PROVIDER', 'Router');

        expect(aiEnv.provider).toBe('router');
      });

      it('should return undefined when not set', () => {
        expect(aiEnv.provider).toBeUndefined();
      });

      it('should throw EnvValidationError for unsupported provider names', () => {
        vi.stubEnv('AI_PROVIDER', 'openai');

        expect(() => aiEnv.provider).toThrow(EnvValidationError);
        expect(() => aiEnv.provider).toThrow(/AI_PROVIDER must be one of/);
      });
    });

    describe('useMock', () => {
      it('should return true when AI_USE_MOCK is truthy', () => {
        vi.stubEnv('AI_USE_MOCK', 'true');

        expect(aiEnv.useMock).toBe(true);
      });

      it('should return false when AI_USE_MOCK is falsey', () => {
        vi.stubEnv('AI_USE_MOCK', '0');

        expect(aiEnv.useMock).toBe(false);
      });

      it('should return undefined when not set', () => {
        expect(aiEnv.useMock).toBeUndefined();
      });

      it('should throw when AI_USE_MOCK is malformed', () => {
        vi.stubEnv('AI_USE_MOCK', 'sometimes');

        expect(() => aiEnv.useMock).toThrow(
          /AI_USE_MOCK must be one of: true, false, 1, 0/,
        );
      });
    });
  });

  describe('regenerationQueueEnv', () => {
    it('keeps a minimum of 1 for positive fractional drain counts', () => {
      vi.stubEnv('REGENERATION_MAX_JOBS_PER_DRAIN', '0.5');

      expect(regenerationQueueEnv.maxJobsPerDrain).toBe(1);
    });

    it('allows zero drain counts explicitly', () => {
      vi.stubEnv('REGENERATION_MAX_JOBS_PER_DRAIN', '0');

      expect(regenerationQueueEnv.maxJobsPerDrain).toBe(0);
    });
  });

  describe('maintenanceEnv', () => {
    it('does not require a worker token when manual retention cleanup is disabled in production', () => {
      vi.stubGlobal('window', undefined);
      const maintenance = createMaintenanceEnvForTests({
        NODE_ENV: 'production',
        RETENTION_CLEANUP_ENABLED: 'false',
      });

      expect(maintenance.retentionCleanupEnabled).toBe(false);
      expect(maintenance.workerToken).toBeUndefined();
    });

    it('requires a worker token when manual retention cleanup is enabled in production', () => {
      vi.stubGlobal('window', undefined);
      const maintenance = createMaintenanceEnvForTests({
        NODE_ENV: 'production',
        RETENTION_CLEANUP_ENABLED: 'true',
      });

      expect(maintenance.retentionCleanupEnabled).toBe(true);
      expect(() => maintenance.workerToken).toThrow(EnvValidationError);
    });

    it('does not require a worker token when plan cleanup is disabled in production', () => {
      vi.stubGlobal('window', undefined);
      const maintenance = createMaintenanceEnvForTests({
        NODE_ENV: 'production',
        PLAN_CLEANUP_ENABLED: 'false',
      });

      expect(maintenance.planCleanupEnabled).toBe(false);
      expect(maintenance.workerToken).toBeUndefined();
    });

    it('requires a worker token when manual plan cleanup is enabled in production', () => {
      vi.stubGlobal('window', undefined);
      const maintenance = createMaintenanceEnvForTests({
        NODE_ENV: 'production',
        PLAN_CLEANUP_ENABLED: 'true',
      });

      expect(maintenance.planCleanupEnabled).toBe(true);
      expect(() => maintenance.workerToken).toThrow(EnvValidationError);
    });

    it('requires a worker token when Clerk Billing reconciliation is enabled in production', () => {
      vi.stubGlobal('window', undefined);
      const maintenance = createMaintenanceEnvForTests({
        NODE_ENV: 'production',
        CLERK_BILLING_RECONCILIATION_ENABLED: 'true',
      });

      expect(maintenance.clerkBillingReconciliationEnabled).toBe(true);
      expect(() => maintenance.workerToken).toThrow(EnvValidationError);
    });

    it('requires a worker health token in production', () => {
      vi.stubGlobal('window', undefined);
      const maintenance = createMaintenanceEnvForTests({
        NODE_ENV: 'production',
      });

      expect(() => maintenance.workerHealthToken).toThrow(EnvValidationError);
    });

    it('allows an optional worker health token outside production', () => {
      vi.stubGlobal('window', undefined);
      const maintenance = createMaintenanceEnvForTests({
        NODE_ENV: 'test',
      });

      expect(maintenance.workerHealthToken).toBeUndefined();
    });
  });

  describe('parseEnvNumber', () => {
    it('returns undefined when value is undefined and no fallback', () => {
      expect(parseEnvNumber(undefined)).toBeUndefined();
    });

    it('returns fallback when value is undefined and fallback is set', () => {
      expect(parseEnvNumber(undefined, 42)).toBe(42);
    });

    it('parses integer and float strings', () => {
      expect(parseEnvNumber('42')).toBe(42);
      expect(parseEnvNumber('3.14')).toBe(3.14);
    });

    it('returns undefined for invalid string when no fallback', () => {
      expect(parseEnvNumber('not-a-number')).toBeUndefined();
    });

    it('returns fallback for invalid string when fallback is set', () => {
      expect(parseEnvNumber('not-a-number', 99)).toBe(99);
    });

    it('matches Number() for edge cases', () => {
      expect(parseEnvNumber('0')).toBe(0);
      expect(parseEnvNumber('')).toBe(0);
    });

    it('rejects non-finite numeric strings', () => {
      expect(parseEnvNumber('Infinity')).toBeUndefined();
      expect(parseEnvNumber('-Infinity')).toBeUndefined();
      expect(parseEnvNumber('Infinity', 42)).toBe(42);
      expect(parseEnvNumber('NaN', 42)).toBe(42);
    });
  });

  describe('toBoolean', () => {
    it('returns fallback when value is undefined', () => {
      expect(toBoolean(undefined, true)).toBe(true);
      expect(toBoolean(undefined, false)).toBe(false);
    });

    it('treats true and 1 as true (trimmed, case-insensitive)', () => {
      expect(toBoolean('true', false)).toBe(true);
      expect(toBoolean('TRUE', false)).toBe(true);
      expect(toBoolean('1', false)).toBe(true);
      expect(toBoolean('  true  ', false)).toBe(true);
    });

    it('treats other strings as false', () => {
      expect(toBoolean('false', true)).toBe(false);
      expect(toBoolean('0', true)).toBe(false);
    });

    it('treats empty strings as missing and falls back', () => {
      expect(toBoolean('', true)).toBe(true);
      expect(toBoolean('   ', false)).toBe(false);
    });
  });

  describe('workflowEnv', () => {
    it('defaults module lesson workflow flag to false', () => {
      vi.stubEnv('MODULE_LESSON_WORKFLOW_ENABLED', undefined);
      expect(workflowEnv.moduleLessonWorkflowEnabled).toBe(false);
    });

    it('parses MODULE_LESSON_WORKFLOW_ENABLED as boolean', () => {
      const access = createServerEnvAccess(() => ({
        MODULE_LESSON_WORKFLOW_ENABLED: 'true',
      }));
      expect(
        createWorkflowEnvForTests(access).moduleLessonWorkflowEnabled,
      ).toBe(true);
    });

    it('defaults plan regeneration and plan generation workflow flags to false', () => {
      vi.stubEnv('PLAN_REGENERATION_WORKFLOW_ENABLED', undefined);
      vi.stubEnv('PLAN_GENERATION_WORKFLOW_ENABLED', undefined);
      expect(workflowEnv.planRegenerationWorkflowEnabled).toBe(false);
      expect(workflowEnv.planGenerationWorkflowEnabled).toBe(false);
    });

    it('parses plan workflow flags as booleans', () => {
      const access = createServerEnvAccess(() => ({
        PLAN_REGENERATION_WORKFLOW_ENABLED: 'true',
        PLAN_GENERATION_WORKFLOW_ENABLED: '1',
      }));
      const env = createWorkflowEnvForTests(access);
      expect(env.planRegenerationWorkflowEnabled).toBe(true);
      expect(env.planGenerationWorkflowEnabled).toBe(true);
    });

    it('throws EnvValidationError for invalid workflow flag values', () => {
      const access = createServerEnvAccess(() => ({
        MODULE_LESSON_WORKFLOW_ENABLED: 'maybe',
      }));

      expect(
        () => createWorkflowEnvForTests(access).moduleLessonWorkflowEnabled,
      ).toThrow(EnvValidationError);
    });

    it('throws EnvValidationError for invalid plan regeneration workflow flag values', () => {
      const access = createServerEnvAccess(() => ({
        PLAN_REGENERATION_WORKFLOW_ENABLED: 'maybe',
      }));

      expect(
        () => createWorkflowEnvForTests(access).planRegenerationWorkflowEnabled,
      ).toThrow(EnvValidationError);
    });

    it('throws EnvValidationError for invalid plan generation workflow flag values', () => {
      const access = createServerEnvAccess(() => ({
        PLAN_GENERATION_WORKFLOW_ENABLED: 'maybe',
      }));

      expect(
        () => createWorkflowEnvForTests(access).planGenerationWorkflowEnabled,
      ).toThrow(EnvValidationError);
    });

    it('reads WORKFLOW_CALLBACK_TOKEN when configured', () => {
      vi.stubGlobal('window', undefined);
      const access = createServerEnvAccess(() => ({
        NODE_ENV: 'production',
        WORKFLOW_CALLBACK_TOKEN: 'prod-secret',
      }));

      expect(createWorkflowEnvForTests(access).callbackToken).toBe(
        'prod-secret',
      );
    });

    it('trims WORKFLOW_CALLBACK_TOKEN when configured', () => {
      vi.stubGlobal('window', undefined);
      const access = createServerEnvAccess(() => ({
        NODE_ENV: 'production',
        WORKFLOW_CALLBACK_TOKEN: '  prod-secret  ',
      }));

      expect(createWorkflowEnvForTests(access).callbackToken).toBe(
        'prod-secret',
      );
    });

    it('throws EnvValidationError for whitespace-only WORKFLOW_CALLBACK_TOKEN', () => {
      vi.stubGlobal('window', undefined);
      const access = createServerEnvAccess(() => ({
        NODE_ENV: 'production',
        WORKFLOW_CALLBACK_TOKEN: '   ',
      }));

      expect(() => createWorkflowEnvForTests(access).callbackToken).toThrow(
        EnvValidationError,
      );
    });

    it('readWorkflowCallbackTokenConfig returns invalid for whitespace-only token', () => {
      vi.stubGlobal('window', undefined);
      const access = createServerEnvAccess(() => ({
        NODE_ENV: 'production',
        WORKFLOW_CALLBACK_TOKEN: '   ',
      }));

      expect(readWorkflowCallbackTokenConfig(access)).toEqual({
        status: 'invalid',
      });
    });

    it('treats empty WORKFLOW_CALLBACK_TOKEN as unset', () => {
      vi.stubGlobal('window', undefined);
      const access = createServerEnvAccess(() => ({
        NODE_ENV: 'production',
        WORKFLOW_CALLBACK_TOKEN: '',
      }));

      expect(createWorkflowEnvForTests(access).callbackToken).toBeUndefined();
    });

    it('does not require WORKFLOW_CALLBACK_TOKEN outside production', () => {
      const access = createServerEnvAccess(() => ({
        NODE_ENV: 'development',
      }));

      expect(createWorkflowEnvForTests(access).callbackToken).toBeUndefined();
    });

    it('does not require WORKFLOW_CALLBACK_TOKEN in production env reads', () => {
      vi.stubGlobal('window', undefined);
      const access = createServerEnvAccess(() => ({
        NODE_ENV: 'production',
      }));

      expect(createWorkflowEnvForTests(access).callbackToken).toBeUndefined();
    });
  });

  describe('barrel surface', () => {
    it('re-exports core config symbols from @/lib/config/env', async () => {
      const env = await import('@/lib/config/env');

      expect(env.appEnv).toBeDefined();
      expect(env.databaseEnv).toBeDefined();
      expect(env.stripeEnv).toBeDefined();
      expect(env.aiEnv).toBeDefined();
      expect(env.workflowEnv).toBeDefined();
      expect(env.getAttemptCap).toBeTypeOf('function');
      expect(env.setDevAuthUserIdForTests).toBeTypeOf('function');
      expect(env.clearDevAuthUserIdForTests).toBeTypeOf('function');
    });
  });
});
