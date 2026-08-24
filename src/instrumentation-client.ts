// Sentry browser SDK init (Next.js client instrumentation entry).
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import { toBoolean } from '@/lib/config/env/shared';
import {
  getReplayErrorSampleRate,
  getReplaySessionSampleRate,
  shouldEnableLogs,
  tracesSampler,
} from '@/lib/observability/sampling';
import { beforeSendSentryEvent } from '@/lib/observability/sentry-filters';
import { normalizePostHogSdkHost } from '@/lib/posthog-rewrite-destinations';
import * as Sentry from '@sentry/nextjs';
import posthog from 'posthog-js';

// NOTE: We read `process.env` directly here instead of importing from
// `@/lib/config/env` because that module eagerly validates server-only
// secrets (CLERK_SECRET_KEY, POSTGRES_URL, etc.) at import time, which would
// throw in this client-side instrumentation bundle. NEXT_PUBLIC_* vars
// are also not exposed through the server env config.
const sendDefaultPii = toBoolean(
  process.env.NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII,
  false,
);
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

// PostHog client-side init — runs once when the browser loads the app.
const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogUiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST
  ? normalizePostHogSdkHost(process.env.NEXT_PUBLIC_POSTHOG_HOST)
  : null;

if (posthogToken) {
  posthog.init(posthogToken, {
    api_host: '/ingest',
    ui_host: posthogUiHost ?? 'https://us.posthog.com',
    // Required baseline defaults
    defaults: '2026-01-30',
    // Capture unhandled exceptions via PostHog Error Tracking
    capture_exceptions: true,
    // Debug logging in development
    debug: process.env.NODE_ENV === 'development',
  });
} else if (process.env.NODE_ENV !== 'production') {
  // Warn in non-production so misconfiguration is visible during development.
  console.warn(
    'NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN or NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once both variables are configured',
  );
}

export const onRouterTransitionStart: typeof Sentry.captureRouterTransitionStart =
  (...args) => {
    if (!isSentryEnabled) {
      return;
    }

    return Sentry.captureRouterTransitionStart(...args);
  };
