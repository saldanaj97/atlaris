import { recordRegenerationWorkflowAttachUncertain } from '@/lib/logging/ops-alerts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentryMocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  setExtra: vi.fn(),
  setTag: vi.fn(),
  withScope: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: sentryMocks.captureException,
  withScope: sentryMocks.withScope.mockImplementation(
    (callback: (scope: unknown) => void) => {
      callback({
        setExtra: sentryMocks.setExtra,
        setTag: sentryMocks.setTag,
      });
    },
  ),
}));

const context = {
  jobId: 'job-1',
  planId: 'plan-1',
  userId: 'user-1',
  workflowRunId: 'wrun-1',
  cancellationSucceeded: false,
};

describe('recordRegenerationWorkflowAttachUncertain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('omits userId when Sentry PII telemetry is not opted in', () => {
    recordRegenerationWorkflowAttachUncertain(context, new Error('attach'));

    expect(sentryMocks.setExtra).not.toHaveBeenCalledWith(
      'userId',
      context.userId,
    );
  });

  it('includes userId when Sentry PII telemetry is opted in', () => {
    vi.stubEnv('SENTRY_SEND_DEFAULT_PII', 'true');

    recordRegenerationWorkflowAttachUncertain(context, new Error('attach'));

    expect(sentryMocks.setExtra).toHaveBeenCalledWith('userId', context.userId);
  });
});
