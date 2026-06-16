import type { ErrorEvent, EventHint } from '@sentry/nextjs';

import {
  beforeSendSentryEvent,
  isDevCompilationErrorMessage,
  isTransientDevCompilationError,
  shouldCaptureRequestError,
} from '@/lib/observability/sentry-filters';
import { afterEach, describe, expect, it, vi } from 'vitest';

function withEnv(nodeEnv: string, fn: () => void) {
  vi.stubEnv('NODE_ENV', nodeEnv);
  try {
    fn();
  } finally {
    vi.unstubAllEnvs();
  }
}

function wrappedBuildError(message: string): Error & { innerError: Error } {
  const innerError = new Error(message);
  return Object.assign(new Error(), { innerError });
}

describe('isDevCompilationErrorMessage', () => {
  it('matches Turbopack parse failures', () => {
    expect(
      isDevCompilationErrorMessage(
        'src/app/dashboard/DashboardContent.tsx:19:1\nParsing ecmascript source code failed',
      ),
    ).toBe(true);
  });

  it('matches module resolution failures', () => {
    expect(
      isDevCompilationErrorMessage("Module not found: Can't resolve 'foo'"),
    ).toBe(true);
  });

  it('does not match unrelated runtime errors', () => {
    expect(
      isDevCompilationErrorMessage('Cannot read properties of undefined'),
    ).toBe(false);
  });
});

describe('isTransientDevCompilationError', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true for wrapped build errors in development', () => {
    withEnv('development', () => {
      expect(
        isTransientDevCompilationError(
          wrappedBuildError(
            'src/app/dashboard/DashboardContent.tsx:19:1\nParsing ecmascript source code failed',
          ),
        ),
      ).toBe(true);
    });
  });

  it('returns false for wrapped build errors in production', () => {
    withEnv('production', () => {
      expect(
        isTransientDevCompilationError(
          wrappedBuildError(
            'src/app/dashboard/DashboardContent.tsx:19:1\nParsing ecmascript source code failed',
          ),
        ),
      ).toBe(false);
    });
  });

  it('returns false for unrelated runtime errors in development', () => {
    withEnv('development', () => {
      expect(
        isTransientDevCompilationError(new Error('Database connection failed')),
      ).toBe(false);
    });
  });
});

describe('shouldCaptureRequestError', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('drops transient dev compilation errors', () => {
    withEnv('development', () => {
      expect(
        shouldCaptureRequestError(
          wrappedBuildError(
            'src/app/dashboard/DashboardContent.tsx:19:1\nParsing ecmascript source code failed',
          ),
        ),
      ).toBe(false);
    });
  });

  it('keeps real runtime errors', () => {
    withEnv('development', () => {
      expect(
        shouldCaptureRequestError(new Error('Stripe webhook failed')),
      ).toBe(true);
    });
  });
});

describe('beforeSendSentryEvent', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('drops transient dev compilation errors from hint.originalException', () => {
    withEnv('development', () => {
      const event = { event_id: '1' } as ErrorEvent;
      const hint = {
        originalException: wrappedBuildError(
          'src/app/dashboard/DashboardContent.tsx:19:1\nParsing ecmascript source code failed',
        ),
      } as EventHint;

      expect(beforeSendSentryEvent(event, hint)).toBeNull();
    });
  });

  it('drops dev compilation errors from exception value', () => {
    withEnv('development', () => {
      const event = {
        event_id: '1',
        exception: {
          values: [
            {
              value:
                'src/app/dashboard/DashboardContent.tsx:19:1\nParsing ecmascript source code failed',
            },
          ],
        },
      } as ErrorEvent;
      const hint = { originalException: new Error('wrapper') } as EventHint;

      expect(beforeSendSentryEvent(event, hint)).toBeNull();
    });
  });

  it('passes through unrelated errors', () => {
    withEnv('development', () => {
      const event = { event_id: '1' } as ErrorEvent;
      const hint = {
        originalException: new Error('Stripe webhook failed'),
      } as EventHint;

      expect(beforeSendSentryEvent(event, hint)).toBe(event);
    });
  });
});
