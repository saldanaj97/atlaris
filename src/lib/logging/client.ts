'use client';

import * as Sentry from '@sentry/nextjs';

type BrowserLogLevel = 'error' | 'warn' | 'info' | 'debug';

type LogMethod = (...args: unknown[]) => void;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function createSentryLogger(level: BrowserLogLevel): LogMethod {
  return (...args: unknown[]) => {
    const [first, ...rest] = args;
    const message = typeof first === 'string' ? first : String(first);
    const attributes: Record<string, unknown> | undefined =
      rest.length === 1 && isPlainObject(rest[0])
        ? rest[0]
        : rest.length > 0
          ? { extra: rest }
          : undefined;

    if (process.env.NODE_ENV !== 'production') {
      const method = console[level] ?? console.log;
      method(...args);
    }

    switch (level) {
      case 'error':
        Sentry.logger.error(message, attributes);
        break;
      case 'warn':
        Sentry.logger.warn(message, attributes);
        break;
      case 'info':
        Sentry.logger.info(message, attributes);
        break;
      case 'debug':
        Sentry.logger.debug(message, attributes);
        break;
    }
  };
}

export const clientLogger = {
  error: createSentryLogger('error'),
  warn: createSentryLogger('warn'),
  info: createSentryLogger('info'),
  debug: createSentryLogger('debug'),
};

export type ClientLogger = typeof clientLogger;
