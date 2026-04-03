import * as Sentry from '@sentry/nextjs';

function isSentryEnabled(): boolean {
  return process.env.ENABLE_SENTRY?.trim().toLowerCase() !== 'false';
}

export async function register() {
  if (!isSentryEnabled()) {
    return;
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError: typeof Sentry.captureRequestError = (...args) => {
  if (!isSentryEnabled()) {
    return;
  }

  return Sentry.captureRequestError(...args);
};
