// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

import {
  getReplayErrorSampleRate,
  getReplaySessionSampleRate,
  shouldEnableLogs,
  tracesSampler,
} from '@/lib/observability/sampling';

// NOTE: We read `process.env` directly here instead of importing from
// `@/lib/config/env` because that module eagerly validates server-only
// secrets (NEON_AUTH_*, DATABASE_URL, etc.) at import time, which would
// throw in this client-side instrumentation bundle. NEXT_PUBLIC_* vars
// are also not exposed through the server env config.
const sendDefaultPii =
  process.env.NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII?.trim().toLowerCase() ===
  'true';

Sentry.init({
  dsn: 'https://443a1b04060b39f8cb7665becc8d21d6@o4510462002462720.ingest.us.sentry.io/4510462272667648',

  // Session replay — see src/lib/observability/sampling.ts for per-env rates.
  integrations: [Sentry.replayIntegration()],

  // Context-aware trace sampling (replaces flat tracesSampleRate).
  tracesSampler,

  // SDK log shipping — disabled in production to reduce ingest volume.
  enableLogs: shouldEnableLogs(),

  // Replay: 10 % sessions in prod (cost control), 100 % error replays (always).
  // See src/lib/observability/sampling.ts for full rationale.
  replaysSessionSampleRate: getReplaySessionSampleRate(),
  replaysOnErrorSampleRate: getReplayErrorSampleRate(),

  // Intentionally gated: enable PII forwarding only with explicit opt-in via env.
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
