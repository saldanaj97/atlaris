import { getServerOptional, toBoolean } from '@/lib/config/env/shared';

export const loggingEnv = {
  get level(): string | undefined {
    return getServerOptional('LOG_LEVEL');
  },
} as const;

/** Sentry/telemetry server flags. */
export const sentryEnv = {
  /**
   * `SENTRY_SEND_DEFAULT_PII`; defaults to false. Mirrors the client opt-in
   * `NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII` (see src/instrumentation-client.ts).
   */
  get sendDefaultPii(): boolean {
    return toBoolean(getServerOptional('SENTRY_SEND_DEFAULT_PII'), false);
  },
} as const;
