'use client';

type BrowserLogLevel = 'error' | 'warn' | 'info' | 'debug';

type LogMethod = (...args: unknown[]) => void;

function createBrowserLogger(level: BrowserLogLevel): LogMethod {
  return (...args) => {
    const method = console[level] ?? console.log;
    method(...args);
  };
}

// TODO: Look into whether we should use the logger from @sentry/nextjs as well
export const clientLogger = {
  error: createBrowserLogger('error'),
  warn: createBrowserLogger('warn'),
  info: createBrowserLogger('info'),
  debug: createBrowserLogger('debug'),
};

export type ClientLogger = typeof clientLogger;
