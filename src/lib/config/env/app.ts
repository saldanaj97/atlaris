import { z } from 'zod';
import {
  createServerEnvAccess,
  type EnvSource,
  EnvValidationError,
  getProcessEnvSource,
  isProdRuntimeEnv,
  optionalEnvFrom,
  parseNodeEnv,
  type ServerEnvAccess,
  toBoolean,
} from '@/lib/config/env/shared';

type NodeEnv = 'development' | 'production' | 'test';

const APP_URL_SCHEMA = z.string().url();
const APP_URL_CACHE_KEY = 'APP_URL_NORMALIZED';

/**
 * App/runtime env facets derived from an explicit env source and server access helper.
 */
interface AppEnv {
  readonly nodeEnv: NodeEnv;
  readonly vitestWorkerId: string | undefined;
  readonly isProduction: boolean;
  readonly isDevelopment: boolean;
  readonly isTest: boolean;
  readonly url: string;
  readonly maintenanceMode: boolean;
}

export function createAppEnv(env: EnvSource, access: ServerEnvAccess): AppEnv {
  const normalizeUrl = (requireHttps: boolean): string => {
    const raw = requireHttps
      ? access.getServerRequired('APP_URL')
      : (access.getServerOptional('APP_URL') ?? 'http://localhost:3000');
    const parsed = APP_URL_SCHEMA.safeParse(raw);
    if (!parsed.success) {
      throw new EnvValidationError(
        'APP_URL must be a valid absolute URL',
        'APP_URL'
      );
    }
    if (requireHttps && !parsed.data.startsWith('https://')) {
      throw new EnvValidationError(
        'APP_URL must use https in production',
        'APP_URL'
      );
    }
    return parsed.data.replace(/\/$/, '');
  };

  return {
    get nodeEnv(): NodeEnv {
      return parseNodeEnv(env);
    },
    get vitestWorkerId(): string | undefined {
      return optionalEnvFrom(env, 'VITEST_WORKER_ID');
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
      const isProduction = isProdRuntimeEnv(env);
      if (!isProduction) {
        return normalizeUrl(false);
      }
      return access.getProductionCached(APP_URL_CACHE_KEY, () =>
        normalizeUrl(true)
      );
    },
    get maintenanceMode(): boolean {
      return toBoolean(access.getServerOptional('MAINTENANCE_MODE'), false);
    },
  };
}

const defaultAppAccess = createServerEnvAccess(getProcessEnvSource);

export const appEnv = createAppEnv(getProcessEnvSource(), defaultAppAccess);
