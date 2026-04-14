import { getServerOptional, parseEnvNumber } from '@/lib/config/env/shared';

export const DEFAULT_SENTRY_SAMPLE_RATE = 0.1;

export const loggingEnv = {
  get level(): string | undefined {
    return getServerOptional('LOG_LEVEL');
  },
} as const;

export const observabilityEnv = {
  get sentryDsn(): string | undefined {
    return getServerOptional('SENTRY_DSN');
  },
  get sentryTracesSampleRate(): number {
    return parseEnvNumber(
      getServerOptional('SENTRY_TRACES_SAMPLE_RATE'),
      DEFAULT_SENTRY_SAMPLE_RATE
    );
  },
  get sentryProfilesSampleRate(): number {
    return parseEnvNumber(
      getServerOptional('SENTRY_PROFILES_SAMPLE_RATE'),
      DEFAULT_SENTRY_SAMPLE_RATE
    );
  },
} as const;
