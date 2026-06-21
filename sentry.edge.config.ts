// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import { sentryEnv } from '@/lib/config/env/observability';
import { shouldEnableLogs, tracesSampler } from '@/lib/observability/sampling';
import { beforeSendSentryEvent } from '@/lib/observability/sentry-filters';
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://443a1b04060b39f8cb7665becc8d21d6@o4510462002462720.ingest.us.sentry.io/4510462272667648',

  // Context-aware trace sampling — see src/lib/observability/sampling.ts for
  // per-route rates and rationale.
  tracesSampler,

  beforeSend: beforeSendSentryEvent,

  // Vercel AI integration (required for Edge - not enabled by default)
  integrations: (defaultIntegrations) => [
    ...defaultIntegrations,
    Sentry.vercelAIIntegration(),
  ],

  // SDK log shipping — disabled in production to reduce ingest volume.
  // Errors are still captured via captureException.
  enableLogs: shouldEnableLogs(),

  // Application Metrics are enabled explicitly so repo instrumentation can use
  // Sentry.metrics.count/gauge/distribution consistently across SDK upgrades.
  enableMetrics: true,

  // Forward user PII only when explicitly opted in (default false). Mirrors the
  // server gate in sentry.server.config.ts and client gate in instrumentation-client.ts.
  sendDefaultPii: sentryEnv.sendDefaultPii,
});
