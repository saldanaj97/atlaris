/**
 * Compatibility barrel — import from `@/lib/config/env` (stable public surface).
 * Domain facets live under `./env/*.ts`.
 */

export {
  type AiEnvConfig,
  type AiEnvFacets,
  type AiMockEnv,
  type AiTimeoutEnv,
  type AttemptsEnv,
  aiEnv,
  aiTimeoutEnv,
  attemptsEnv,
  createAiEnvFacets,
  getAttemptCap,
  type OpenRouterEnv,
  openRouterEnv,
} from '@/lib/config/env/ai';

export {
  type AppEnv,
  appEnv,
  createAppEnv,
} from '@/lib/config/env/app';
export {
  createNeonAuthEnv,
  devAuthEnv,
  googleOAuthEnv,
  neonAuthEnv,
  oauthEncryptionEnv,
} from '@/lib/config/env/auth';
export { stripeEnv } from '@/lib/config/env/billing';
export { databaseEnv } from '@/lib/config/env/database';
export { localProductTestingEnv } from '@/lib/config/env/local-testing';
export { loggingEnv, observabilityEnv } from '@/lib/config/env/observability';
export {
  type RegenerationQueueEnv,
  regenerationQueueEnv,
} from '@/lib/config/env/queue';
export { avScannerEnv } from '@/lib/config/env/security';
export {
  createServerEnvAccess,
  type EnvSource,
  EnvValidationError,
  getProcessEnvSource,
  getSmokeStateFileEnv,
  isNonProductionRuntimeEnv,
  isProdRuntimeEnv,
  type NodeEnv,
  optionalEnv,
  parseEnvNumber,
  parseNodeEnv,
  requireEnv,
  type ServerEnvAccess,
  toBoolean,
} from '@/lib/config/env/shared';
export {
  clearDevAuthUserIdForTests,
  setDevAuthUserIdForTests,
} from '@/lib/config/env/testing';
