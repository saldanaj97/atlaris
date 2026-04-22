import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_DEFAULT_MODEL, AVAILABLE_MODELS } from '@/features/ai/ai-models';
import {
	aiEnv,
	appEnv,
	createAiEnvFacets,
	createAppEnv,
	createNeonAuthEnv,
	createServerEnvAccess,
	EnvValidationError,
	optionalEnv,
	parseEnvNumber,
	parseNodeEnv,
	regenerationQueueEnv,
	requireEnv,
	toBoolean,
} from '@/lib/config/env';

describe('Environment Configuration', () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
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

	describe('createNeonAuthEnv (pure)', () => {
		it('parses valid non-production config', () => {
			const parsed = createNeonAuthEnv({
				NODE_ENV: 'development',
				NEON_AUTH_BASE_URL: 'http://localhost:9999',
				NEON_AUTH_COOKIE_SECRET: 'x'.repeat(32),
			});

			expect(parsed.baseUrl).toBe('http://localhost:9999');
		});

		it('rejects http base URL in production', () => {
			expect(() =>
				createNeonAuthEnv({
					NODE_ENV: 'production',
					NEON_AUTH_BASE_URL: 'http://localhost:9999',
					NEON_AUTH_COOKIE_SECRET: 'x'.repeat(32),
				}),
			).toThrow(EnvValidationError);
		});

		it('aggregates known validation issues into one error', () => {
			expect(() =>
				createNeonAuthEnv({
					NODE_ENV: 'production',
					NEON_AUTH_BASE_URL: 'http://localhost:9999',
					NEON_AUTH_COOKIE_SECRET: 'short-secret',
				}),
			).toThrow(
				/NEON_AUTH_BASE_URL: NEON_AUTH_BASE_URL must use https in production; NEON_AUTH_COOKIE_SECRET: NEON_AUTH_COOKIE_SECRET must be at least 32 characters in production/,
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

	describe('barrel surface', () => {
		it('re-exports core config symbols from @/lib/config/env', async () => {
			const env = await import('@/lib/config/env');

			expect(env.appEnv).toBeDefined();
			expect(env.databaseEnv).toBeDefined();
			expect(env.stripeEnv).toBeDefined();
			expect(env.aiEnv).toBeDefined();
			expect(env.getAttemptCap).toBeTypeOf('function');
			expect(env.setDevAuthUserIdForTests).toBeTypeOf('function');
			expect(env.clearDevAuthUserIdForTests).toBeTypeOf('function');
		});
	});
});
