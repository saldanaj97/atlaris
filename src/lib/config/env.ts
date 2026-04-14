/**
 * Compatibility barrel — import from `@/lib/config/env` (stable public surface).
 * Domain facets live under `./env/*.ts`.
 */

export {
  ATTEMPT_CAP,
  aiEnv,
  aiTimeoutEnv,
  attemptsEnv,
  openRouterEnv,
} from '@/lib/config/env/ai';

export { appEnv } from '@/lib/config/env/app';
export {
  devAuthEnv,
  googleOAuthEnv,
  neonAuthEnv,
  oauthEncryptionEnv,
} from '@/lib/config/env/auth';
export { stripeEnv } from '@/lib/config/env/billing';
export { databaseEnv } from '@/lib/config/env/database';
export { localProductTestingEnv } from '@/lib/config/env/local-testing';
export { loggingEnv, observabilityEnv } from '@/lib/config/env/observability';
export { regenerationQueueEnv } from '@/lib/config/env/queue';
export { avScannerEnv } from '@/lib/config/env/security';
export {
  EnvValidationError,
  getNodeEnv,
  getServerBoolean,
  getSmokeStateFileEnv,
  nodeEnvSchema,
  optionalEnv,
  parseEnvNumber,
  requireEnv,
  toBoolean,
} from '@/lib/config/env/shared';
export {
  clearDevAuthUserIdForTests,
  setDevAuthUserIdForTests,
} from '@/lib/config/env/testing';
