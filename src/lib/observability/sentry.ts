import * as Sentry from '@sentry/nextjs';

import { appEnv, observabilityEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;

  const dsn = observabilityEnv.sentryDsn;
  if (!dsn) {
    return;
  }

  try {
    Sentry.init({
      dsn,
      environment: appEnv.nodeEnv,
      tracesSampleRate: observabilityEnv.sentryTracesSampleRate,
      profilesSampleRate: observabilityEnv.sentryProfilesSampleRate,
    });

    logger.info(
      {
        provider: 'sentry',
        environment: appEnv.nodeEnv,
      },
      'Initialized Sentry observability'
    );

    initialized = true;
  } catch (error) {
    logger.error(
      {
        err: error,
        provider: 'sentry',
      },
      'Failed to initialize Sentry observability'
    );
  }
}
