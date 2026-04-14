import { z } from 'zod';
import {
  EnvValidationError,
  getNodeEnv,
  getServerOptional,
  getServerRequired,
  IS_PROD_RUNTIME,
  IS_TEST_RUNTIME,
  type NodeEnv,
  optionalEnv,
  serverOptionalCache,
  toBoolean,
} from '@/lib/config/env/shared';

const APP_URL_SCHEMA = z.string().url();
const APP_URL_CACHE_KEY = 'APP_URL_NORMALIZED';

export const appEnv = {
  get nodeEnv(): NodeEnv {
    return getNodeEnv();
  },
  get vitestWorkerId(): string | undefined {
    return optionalEnv('VITEST_WORKER_ID');
  },
  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  },
  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  },
  get isTest(): boolean {
    return this.nodeEnv === 'test' || Boolean(this.vitestWorkerId);
  },
  /**
   * Application base URL for constructing absolute URLs (e.g., Stripe redirects).
   * Required in production, falls back to localhost in development/test environments.
   */
  get url(): string {
    if (!IS_TEST_RUNTIME && serverOptionalCache.has(APP_URL_CACHE_KEY)) {
      const cached = serverOptionalCache.get(APP_URL_CACHE_KEY);
      if (cached) {
        return cached;
      }
    }

    const raw = IS_PROD_RUNTIME
      ? getServerRequired('APP_URL')
      : (getServerOptional('APP_URL') ?? 'http://localhost:3000');
    const parsed = APP_URL_SCHEMA.safeParse(raw);
    if (!parsed.success) {
      throw new EnvValidationError(
        'APP_URL must be a valid absolute URL',
        'APP_URL'
      );
    }
    if (IS_PROD_RUNTIME && !parsed.data.startsWith('https://')) {
      throw new EnvValidationError(
        'APP_URL must use https in production',
        'APP_URL'
      );
    }
    const normalized = parsed.data.replace(/\/$/, '');
    if (!IS_TEST_RUNTIME) {
      serverOptionalCache.set(APP_URL_CACHE_KEY, normalized);
    }
    return normalized;
  },
  get maintenanceMode(): boolean {
    return toBoolean(getServerOptional('MAINTENANCE_MODE'), false);
  },
} as const;
