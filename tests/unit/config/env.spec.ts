import { AI_DEFAULT_MODEL } from '@/lib/ai/ai-models';
import {
  EnvValidationError,
  aiEnv,
  appEnv,
  optionalEnv,
  requireEnv,
} from '@/lib/config/env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
  });

  describe('aiEnv', () => {
    describe('defaultModel', () => {
      it('should return configured value when AI_DEFAULT_MODEL is valid', () => {
        process.env.AI_DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';
        expect(aiEnv.defaultModel).toBe('anthropic/claude-haiku-4.5');
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

  // Note: Tests for environment-specific configurations, number parsing, and boolean parsing
  // are omitted because they require dynamic module reloading (using require())
  // which is not compatible with ES modules and the project's linting rules.
});
