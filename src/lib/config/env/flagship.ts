import {
  createServerEnvAccess,
  type EnvSource,
  getProcessEnvSource,
  isHostedDeployEnv,
  optionalEnvFrom,
  type ServerEnvAccess,
} from '@/lib/config/env/shared';

export type FlagEnvironment = 'development' | 'staging' | 'production';

/**
 * Cloudflare Flagship settings for the app (`src/flags.ts`). The jobs Worker
 * needs none of these: it evaluates through its `FLAGS` binding.
 */
interface FlagshipEnv {
  readonly appId: string | undefined;
  readonly accountId: string | undefined;
  readonly apiToken: string | undefined;
  readonly isConfigured: boolean;
  /**
   * Hosted deployments (Vercel) must evaluate real flags: an unconfigured
   * provider there is an outage, so evaluations throw and the gate fail-safes
   * apply. Locally and in tests, flags fall back to their defaults silently.
   */
  readonly isRequired: boolean;
  readonly environment: FlagEnvironment;
}

function createFlagshipEnv(
  env: EnvSource,
  access: ServerEnvAccess,
): FlagshipEnv {
  return {
    get appId(): string | undefined {
      return access.getServerOptional('FLAGSHIP_BACKEND_APP_ID');
    },
    get accountId(): string | undefined {
      return access.getServerOptional('FLAGSHIP_BACKEND_ACCOUNT_ID');
    },
    get apiToken(): string | undefined {
      return access.getServerOptional('FLAGSHIP_API_TOKEN');
    },
    get isConfigured(): boolean {
      return Boolean(this.appId && this.accountId && this.apiToken);
    },
    get isRequired(): boolean {
      return isHostedDeployEnv(env);
    },
    get environment(): FlagEnvironment {
      switch (optionalEnvFrom(env, 'VERCEL_ENV')) {
        case 'production':
          return 'production';
        case 'preview':
          return 'staging';
        default:
          return 'development';
      }
    },
  };
}

export function createFlagshipEnvForTests(env: EnvSource): FlagshipEnv {
  return createFlagshipEnv(
    env,
    createServerEnvAccess(() => env),
  );
}

export const flagshipEnv = createFlagshipEnv(
  getProcessEnvSource(),
  createServerEnvAccess(getProcessEnvSource),
);
