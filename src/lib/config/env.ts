export {
  aiEnv,
  aiTimeoutEnv,
  createAiEnvFacets,
  getAttemptCap,
  openRouterEnv,
} from '@/lib/config/env/ai';

export { appEnv, createAppEnv } from '@/lib/config/env/app';
export { createClerkAuthEnv, devAuthEnv } from '@/lib/config/env/auth';
export { stripeEnv } from '@/lib/config/env/billing';
export { databaseEnv } from '@/lib/config/env/database';
export { localProductTestingEnv } from '@/lib/config/env/local-testing';
export { loggingEnv } from '@/lib/config/env/observability';
export { createLessonContentEnvForTests } from '@/lib/config/env/lesson-content';
export { maintenanceEnv } from '@/lib/config/env/maintenance';
export { regenerationQueueEnv } from '@/lib/config/env/queue';
export { createSupabasePublicEnv } from '@/lib/config/env/supabase';
export {
  assertHostedDeployForbiddenFlags,
  createServerEnvAccess,
  EnvValidationError,
  getSmokeStateFileEnv,
  optionalEnv,
  parseEnvNumber,
  parseNodeEnv,
  requireEnv,
  toBoolean,
} from '@/lib/config/env/shared';
export {
  clearDevAuthUserIdForTests,
  setDevAuthUserIdForTests,
} from '@/lib/config/env/testing';
