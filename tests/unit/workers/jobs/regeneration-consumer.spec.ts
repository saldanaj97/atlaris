import type { RegenerationQueueMessage } from '../../../../workers/jobs/src/jobs/regeneration-shared';

import {
  createSkippingModuleLessonStarter,
  handleRegenerationBatch,
  type RegenerationConsumerDeps,
} from '../../../../workers/jobs/src/jobs/regeneration-consumer';
import { makeDbClient } from '../../../fixtures/db-mocks';
import { describe, expect, it, vi } from 'vitest';

const JOB_ID = '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c';
const NOW_MS = 1_790_000_000_000;
const TAGS = { job: 'regeneration', runtime: 'cloudflare-worker' };

function makeMessage(
  body: unknown = { v: 1, jobId: JOB_ID },
  attempts = 1,
): Message<RegenerationQueueMessage> & {
  ack: ReturnType<typeof vi.fn<() => void>>;
  retry: ReturnType<typeof vi.fn<(options?: QueueRetryOptions) => void>>;
} {
  return {
    id: 'msg-1',
    timestamp: new Date(NOW_MS),
    body: body as RegenerationQueueMessage,
    attempts,
    ack: vi.fn<() => void>(),
    retry: vi.fn<(options?: QueueRetryOptions) => void>(),
  };
}

function makeBatch(message = makeMessage()) {
  const batch = {
    messages: [message],
    queue: 'atlaris-regeneration-staging',
    metadata: {
      metrics: { backlogCount: 1, backlogBytes: 1 },
    },
    retryAll: vi.fn(),
    ackAll: vi.fn(),
  } satisfies MessageBatch<RegenerationQueueMessage>;
  return { batch, message };
}

function makeDeps(
  overrides: Partial<RegenerationConsumerDeps> = {},
  env: Record<string, string> = { JOB_REGENERATION_ENABLED: 'true' },
) {
  const db = makeDbClient();
  const deps = {
    env,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    captureException: vi.fn(),
    withDb: vi.fn(async (fn) => fn(db)) as RegenerationConsumerDeps['withDb'],
    run: vi.fn(async () => ({
      kind: 'completed' as const,
      jobId: JOB_ID,
      planId: 'plan-1',
    })),
    terminalize: vi.fn(async () => true),
    startModuleLessons: vi.fn(),
    now: () => NOW_MS,
    ...overrides,
  } satisfies RegenerationConsumerDeps;
  return deps;
}

describe('handleRegenerationBatch', () => {
  it.each([
    ['paused', { JOBS_PAUSED: 'true', JOB_REGENERATION_ENABLED: 'true' }],
    ['disabled', {}],
  ])('holds the batch for 900 s while %s', async (_label, env) => {
    const deps = makeDeps({}, env);
    const { batch, message } = makeBatch();

    await handleRegenerationBatch(batch, deps);

    expect(batch.retryAll).toHaveBeenCalledWith({ delaySeconds: 900 });
    expect(deps.run).not.toHaveBeenCalled();
    expect(message.ack).not.toHaveBeenCalled();
  });

  it('runs the job with the message id as run id and acknowledges it', async () => {
    const deps = makeDeps();
    const { batch, message } = makeBatch();

    await handleRegenerationBatch(batch, deps);

    expect(deps.withDb).toHaveBeenCalledTimes(1);
    expect(deps.run).toHaveBeenCalledWith(JOB_ID, {
      runId: 'msg-1',
      startModuleLessons: deps.startModuleLessons,
    });
    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.retry).not.toHaveBeenCalled();
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: JOB_ID,
        runId: 'msg-1',
        outcome: 'completed',
        wallMs: 0,
      }),
      'Regeneration run finished',
    );
  });

  it.each(['in-flight', 'already-completed', 'job-not-found'] as const)(
    'acknowledges a losing or stale message (%s) without retrying',
    async (kind) => {
      const deps = makeDeps({
        run: vi.fn(async () =>
          kind === 'in-flight'
            ? { kind, jobId: JOB_ID, runId: 'msg-other' }
            : { kind, jobId: JOB_ID },
        ),
      });
      const { batch, message } = makeBatch();

      await handleRegenerationBatch(batch, deps);

      expect(message.ack).toHaveBeenCalledTimes(1);
      expect(message.retry).not.toHaveBeenCalled();
    },
  );

  it('redelivers a retry-scheduled job when it is due again', async () => {
    const deps = makeDeps({
      run: vi.fn(async () => ({
        kind: 'retry-scheduled' as const,
        jobId: JOB_ID,
        planId: 'plan-1',
        scheduledFor: new Date(NOW_MS + 90_500),
      })),
    });
    const { batch, message } = makeBatch();

    await handleRegenerationBatch(batch, deps);

    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 91 });
    expect(message.ack).not.toHaveBeenCalled();
  });

  it('caps the retry delay at the 24-hour queue limit and floors it at 0', async () => {
    const far = makeDeps({
      run: vi.fn(async () => ({
        kind: 'retry-scheduled' as const,
        jobId: JOB_ID,
        planId: 'plan-1',
        scheduledFor: new Date(NOW_MS + 3 * 86_400_000),
      })),
    });
    const past = makeDeps({
      run: vi.fn(async () => ({
        kind: 'retry-scheduled' as const,
        jobId: JOB_ID,
        planId: 'plan-1',
        scheduledFor: new Date(NOW_MS - 5_000),
      })),
    });
    const first = makeBatch();
    const second = makeBatch();

    await handleRegenerationBatch(first.batch, far);
    await handleRegenerationBatch(second.batch, past);

    expect(first.message.retry).toHaveBeenCalledWith({ delaySeconds: 86_400 });
    expect(second.message.retry).toHaveBeenCalledWith({ delaySeconds: 0 });
  });

  it('retries after 60 s and reports when the run throws before the last delivery', async () => {
    const failure = new Error('database unreachable');
    const deps = makeDeps({ run: vi.fn().mockRejectedValue(failure) });
    const { batch, message } = makeBatch(makeMessage(undefined, 3));

    await handleRegenerationBatch(batch, deps);

    expect(deps.captureException).toHaveBeenCalledWith(failure, {
      tags: TAGS,
      extra: { jobId: JOB_ID, runId: 'msg-1', deliveryAttempt: 3 },
    });
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
    expect(deps.terminalize).not.toHaveBeenCalled();
  });

  it('terminalizes the owned run and acknowledges on the last delivery', async () => {
    const deps = makeDeps({
      run: vi.fn().mockRejectedValue(new Error('provider outage')),
    });
    const { batch, message } = makeBatch(makeMessage(undefined, 4));

    await handleRegenerationBatch(batch, deps);

    expect(deps.terminalize).toHaveBeenCalledWith(JOB_ID, 'msg-1');
    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.retry).not.toHaveBeenCalled();
  });

  it('still acknowledges the last delivery when terminalizing fails', async () => {
    const terminalizeError = new Error('still down');
    const deps = makeDeps({
      run: vi.fn().mockRejectedValue(new Error('down')),
      terminalize: vi.fn().mockRejectedValue(terminalizeError),
    });
    const { batch, message } = makeBatch(makeMessage(undefined, 4));

    await handleRegenerationBatch(batch, deps);

    expect(deps.captureException).toHaveBeenCalledWith(terminalizeError, {
      tags: TAGS,
      extra: { jobId: JOB_ID, runId: 'msg-1', phase: 'terminalize' },
    });
    expect(message.ack).toHaveBeenCalledTimes(1);
  });

  it('drops a message with an invalid body', async () => {
    const deps = makeDeps();
    const { batch, message } = makeBatch(makeMessage({ jobId: 'nope' }));

    await handleRegenerationBatch(batch, deps);

    expect(deps.run).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalledTimes(1);
  });
});

describe('createSkippingModuleLessonStarter', () => {
  it('skips lesson generation and logs it', async () => {
    const logger = { info: vi.fn() };
    const start = createSkippingModuleLessonStarter(logger);

    await expect(
      start({
        dbClient: makeDbClient(),
        userId: 'user-1',
        planId: 'plan-1',
        moduleId: 'module-1',
        correlationId: 'corr-1',
      }),
    ).resolves.toEqual({ kind: 'disabled' });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 'plan-1', moduleId: 'module-1' }),
      expect.stringContaining('skipped'),
    );
  });
});
