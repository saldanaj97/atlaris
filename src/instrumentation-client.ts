// Sentry browser SDK init (Next.js client instrumentation entry).
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import {
  getReplayErrorSampleRate,
  getReplaySessionSampleRate,
  shouldEnableLogs,
  tracesSampler,
} from '@/lib/observability/sampling';
import { beforeSendSentryEvent } from '@/lib/observability/sentry-filters';
import * as Sentry from '@sentry/nextjs';

// NOTE: We read `process.env` directly here instead of importing from
// `@/lib/config/env` because that module eagerly validates server-only
// secrets (CLERK_SECRET_KEY, POSTGRES_URL, etc.) at import time, which would
// throw in this client-side instrumentation bundle. NEXT_PUBLIC_* vars
// are also not exposed through the server env config.
const sendDefaultPii =
  process.env.NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII?.trim().toLowerCase() ===
  'true';
const isSentryEnabled =
  process.env.NEXT_PUBLIC_ENABLE_SENTRY?.trim().toLowerCase() !== 'false';

if (isSentryEnabled) {
  Sentry.init({
    dsn: 'https://443a1b04060b39f8cb7665becc8d21d6@o4510462002462720.ingest.us.sentry.io/4510462272667648',

    // Session replay — see src/lib/observability/sampling.ts for per-env rates.
    integrations: [Sentry.replayIntegration()],

    // Context-aware trace sampling (replaces flat tracesSampleRate).
    tracesSampler,

    beforeSend: beforeSendSentryEvent,

    // SDK log shipping — disabled in production to reduce ingest volume.
    enableLogs: shouldEnableLogs(),

    // Application Metrics are enabled explicitly so browser instrumentation can
    // use Sentry.metrics.count/gauge/distribution consistently across SDK upgrades.
    enableMetrics: true,

    // Replay: 10 % sessions in prod (cost control), 100 % error replays (always).
    // See src/lib/observability/sampling.ts for full rationale.
    replaysSessionSampleRate: getReplaySessionSampleRate(),
    replaysOnErrorSampleRate: getReplayErrorSampleRate(),

    // Intentionally gated: enable PII forwarding only with explicit opt-in via env.
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
    sendDefaultPii,
  });
}

export const onRouterTransitionStart: typeof Sentry.captureRouterTransitionStart =
  (...args) => {
    if (!isSentryEnabled) {
      return;
    }

    return Sentry.captureRouterTransitionStart(...args);
  };
