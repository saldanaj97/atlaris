import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AI_DEFAULT_MODEL, AVAILABLE_MODELS } from '@/features/ai/ai-models';
import {
  aiEnv,
  appEnv,
  EnvValidationError,
  optionalEnv,
  parseEnvNumber,
  requireEnv,
  toBoolean,
} from '@/lib/config/env';

describe('Environment Configuration', () => {
  // Store original env values
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment to original state
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('optionalEnv', () => {
    it('should return value for defined environment variable', () => {
      process.env.TEST_VAR = 'test-value';
      expect(optionalEnv('TEST_VAR')).toBe('test-value');
    });

    it('should return undefined for missing environment variable', () => {
      delete process.env.TEST_VAR;
      expect(optionalEnv('TEST_VAR')).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      process.env.TEST_VAR = '';
      expect(optionalEnv('TEST_VAR')).toBeUndefined();
    });

    it('should return undefined for whitespace-only string', () => {
      process.env.TEST_VAR = '   ';
      expect(optionalEnv('TEST_VAR')).toBeUndefined();
    });

    it('should trim whitespace from value', () => {
      process.env.TEST_VAR = '  test-value  ';
      expect(optionalEnv('TEST_VAR')).toBe('test-value');
    });

    it('should return undefined for null', () => {
      process.env.TEST_VAR = null as any;
      expect(optionalEnv('TEST_VAR')).toBeUndefined();
    });
  });

  describe('requireEnv', () => {
    it('should return value for defined environment variable', () => {
      process.env.REQUIRED_VAR = 'required-value';
      expect(requireEnv('REQUIRED_VAR')).toBe('required-value');
    });

    it('should throw EnvValidationError for missing environment variable', () => {
      delete process.env.REQUIRED_VAR;
      expect(() => requireEnv('REQUIRED_VAR')).toThrow(EnvValidationError);
      expect(() => requireEnv('REQUIRED_VAR')).toThrow(
        'Missing required environment variable: REQUIRED_VAR'
      );
    });

    it('should throw EnvValidationError for empty string', () => {
      process.env.REQUIRED_VAR = '';
      expect(() => requireEnv('REQUIRED_VAR')).toThrow(EnvValidationError);
      expect(() => requireEnv('REQUIRED_VAR')).toThrow(
        'Missing required environment variable: REQUIRED_VAR'
      );
    });

    it('should throw EnvValidationError for whitespace-only string', () => {
      process.env.REQUIRED_VAR = '   ';
      expect(() => requireEnv('REQUIRED_VAR')).toThrow(EnvValidationError);
      expect(() => requireEnv('REQUIRED_VAR')).toThrow(
        'Missing required environment variable: REQUIRED_VAR'
      );
    });

    it('should set envKey property on EnvValidationError', () => {
      delete process.env.REQUIRED_VAR;
      try {
        requireEnv('REQUIRED_VAR');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EnvValidationError);
        expect((error as EnvValidationError).envKey).toBe('REQUIRED_VAR');
      }
    });

    it('should trim whitespace from value', () => {
      process.env.REQUIRED_VAR = '  required-value  ';
      expect(requireEnv('REQUIRED_VAR')).toBe('required-value');
    });
  });

  describe('appEnv', () => {
    describe('nodeEnv', () => {
      it('should return "development" by default', () => {
        delete (process.env as any).NODE_ENV;
        expect(appEnv.nodeEnv).toBe('development');
      });

      it('should return "production" when set', () => {
        (process.env as any).NODE_ENV = 'production';
        expect(appEnv.nodeEnv).toBe('production');
      });

      it('should return "test" when set', () => {
        (process.env as any).NODE_ENV = 'test';
        expect(appEnv.nodeEnv).toBe('test');
      });
    });

    describe('isProduction', () => {
      it('should return true when NODE_ENV is production', () => {
        (process.env as any).NODE_ENV = 'production';
        expect(appEnv.isProduction).toBe(true);
      });

      it('should return false when NODE_ENV is development', () => {
        (process.env as any).NODE_ENV = 'development';
        expect(appEnv.isProduction).toBe(false);
      });

      it('should return false when NODE_ENV is test', () => {
        (process.env as any).NODE_ENV = 'test';
        expect(appEnv.isProduction).toBe(false);
      });
    });

    describe('isDevelopment', () => {
      it('should return true when NODE_ENV is development', () => {
        (process.env as any).NODE_ENV = 'development';
        expect(appEnv.isDevelopment).toBe(true);
      });

      it('should return false when NODE_ENV is production', () => {
        (process.env as any).NODE_ENV = 'production';
        expect(appEnv.isDevelopment).toBe(false);
      });

      it('should return false when NODE_ENV is test', () => {
        (process.env as any).NODE_ENV = 'test';
        expect(appEnv.isDevelopment).toBe(false);
      });

      it('should return true by default (when NODE_ENV is undefined)', () => {
        delete (process.env as any).NODE_ENV;
        expect(appEnv.isDevelopment).toBe(true);
      });
    });

    describe('isTest', () => {
      it('should return true when NODE_ENV is test', () => {
        (process.env as any).NODE_ENV = 'test';
        expect(appEnv.isTest).toBe(true);
      });

      it('should return true when VITEST_WORKER_ID is set', () => {
        (process.env as any).NODE_ENV = 'development';
        process.env.VITEST_WORKER_ID = '1';
        expect(appEnv.isTest).toBe(true);
      });

      it('should return false when neither NODE_ENV is test nor VITEST_WORKER_ID is set', () => {
        (process.env as any).NODE_ENV = 'development';
        delete process.env.VITEST_WORKER_ID;
        expect(appEnv.isTest).toBe(false);
      });
    });

    describe('vitestWorkerId', () => {
      it('should return VITEST_WORKER_ID when set', () => {
        process.env.VITEST_WORKER_ID = '2';
        expect(appEnv.vitestWorkerId).toBe('2');
      });

      it('should return undefined when not set', () => {
        delete process.env.VITEST_WORKER_ID;
        expect(appEnv.vitestWorkerId).toBeUndefined();
      });
    });

    describe('maintenanceMode', () => {
      it('should return false when MAINTENANCE_MODE is unset', () => {
        delete process.env.MAINTENANCE_MODE;
        expect(appEnv.maintenanceMode).toBe(false);
      });

      it('should return true when MAINTENANCE_MODE is true (case-insensitive)', () => {
        process.env.MAINTENANCE_MODE = 'TRUE';
        expect(appEnv.maintenanceMode).toBe(true);
      });

      it('should return true when MAINTENANCE_MODE is lowercase true', () => {
        process.env.MAINTENANCE_MODE = 'true';
        expect(appEnv.maintenanceMode).toBe(true);
      });

      it('should return true when MAINTENANCE_MODE is 1', () => {
        process.env.MAINTENANCE_MODE = '1';
        expect(appEnv.maintenanceMode).toBe(true);
      });

      it('should return false for other non-truthy strings', () => {
        process.env.MAINTENANCE_MODE = 'false';
        expect(appEnv.maintenanceMode).toBe(false);
      });
    });
  });

  describe('aiEnv', () => {
    describe('defaultModel', () => {
      const validModelId = AVAILABLE_MODELS[0]?.id ?? AI_DEFAULT_MODEL;

      it('should return configured value when AI_DEFAULT_MODEL is valid', () => {
        process.env.AI_DEFAULT_MODEL = validModelId;
        expect(aiEnv.defaultModel).toBe(validModelId);
      });

      it('should return fallback when AI_DEFAULT_MODEL is not set', () => {
        delete process.env.AI_DEFAULT_MODEL;
        expect(aiEnv.defaultModel).toBe(AI_DEFAULT_MODEL);
      });

      it('should return fallback when AI_DEFAULT_MODEL is empty', () => {
        process.env.AI_DEFAULT_MODEL = '';
        expect(aiEnv.defaultModel).toBe(AI_DEFAULT_MODEL);
      });

      it('should return fallback when AI_DEFAULT_MODEL is whitespace', () => {
        process.env.AI_DEFAULT_MODEL = '   ';
        expect(aiEnv.defaultModel).toBe(AI_DEFAULT_MODEL);
      });

      it('should throw when AI_DEFAULT_MODEL is not in AVAILABLE_MODELS', () => {
        process.env.AI_DEFAULT_MODEL = 'invalid/nonexistent-model-xyz';

        expect(() => aiEnv.defaultModel).toThrow(EnvValidationError);
        expect(() => aiEnv.defaultModel).toThrow(
          /AI_DEFAULT_MODEL must be one of AVAILABLE_MODELS ids/
        );
      });
    });

    describe('provider', () => {
      it('should return normalized lowercase provider', () => {
        process.env.AI_PROVIDER = 'OpenAI';
        expect(aiEnv.provider).toBe('openai');
      });

      it('should return undefined when not set', () => {
        delete process.env.AI_PROVIDER;
        expect(aiEnv.provider).toBeUndefined();
      });
    });

    describe('useMock', () => {
      it('should return value when AI_USE_MOCK is set', () => {
        process.env.AI_USE_MOCK = 'true';
        expect(aiEnv.useMock).toBe('true');
      });

      it('should return undefined when not set', () => {
        delete process.env.AI_USE_MOCK;
        expect(aiEnv.useMock).toBeUndefined();
      });
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
});
