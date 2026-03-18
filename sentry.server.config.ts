// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

import { shouldEnableLogs, tracesSampler } from '@/lib/observability/sampling';

Sentry.init({
  dsn: 'https://443a1b04060b39f8cb7665becc8d21d6@o4510462002462720.ingest.us.sentry.io/4510462272667648',

  // Context-aware trace sampling — see src/lib/observability/sampling.ts for
  // per-route rates and rationale.
  tracesSampler,

  // SDK log shipping — disabled in production to reduce ingest volume.
  // Errors are still captured via captureException.
  enableLogs: shouldEnableLogs(),

  // Forward Pino logs to Sentry (pino is used in @/lib/logging/logger).
  // Volume is controlled by pino's logger level (info in prod, debug in dev).
  // Vercel AI integration for micro-explanations (generateObject) + force for Vercel builds
  integrations: (defaultIntegrations) => [
    ...defaultIntegrations,
    Sentry.pinoIntegration(),
    Sentry.vercelAIIntegration({ force: true }),
  ],

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});
