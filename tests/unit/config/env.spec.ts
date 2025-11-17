import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { optionalEnv, requireEnv, appEnv } from '@/lib/config/env';

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

    it('should throw error for missing environment variable', () => {
      delete process.env.REQUIRED_VAR;
      expect(() => requireEnv('REQUIRED_VAR')).toThrow(
        'Missing required environment variable: REQUIRED_VAR'
      );
    });

    it('should throw error for empty string', () => {
      process.env.REQUIRED_VAR = '';
      expect(() => requireEnv('REQUIRED_VAR')).toThrow(
        'Missing required environment variable: REQUIRED_VAR'
      );
    });

    it('should throw error for whitespace-only string', () => {
      process.env.REQUIRED_VAR = '   ';
      expect(() => requireEnv('REQUIRED_VAR')).toThrow(
        'Missing required environment variable: REQUIRED_VAR'
      );
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

  // Note: Tests for environment-specific configurations, number parsing, and boolean parsing
  // are omitted because they require dynamic module reloading (using require())
  // which is not compatible with ES modules and the project's linting rules.
});
