import type { RegenerationQueueMessage } from '../../../../workers/jobs/src/jobs/regeneration-shared';

import {
  createWorkflowModuleLessonStarter,
  handleRegenerationBatch,
  type RegenerationConsumerDeps,
} from '../../../../workers/jobs/src/jobs/regeneration-consumer';
import { makeDbClient } from '../../../fixtures/db-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const lessonQueries = vi.hoisted(() => ({
  load: vi.fn(),
  claim: vi.fn(),
  revert: vi.fn(),
}));

vi.mock('@/lib/db/queries/module-lesson-generation', () => ({
  loadModuleLessonGenerationContext: lessonQueries.load,
  claimModuleLessonGenerationOrDescribe: lessonQueries.claim,
  revertModuleLessonGeneratingToNotGenerated: lessonQueries.revert,
}));

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

describe('createWorkflowModuleLessonStarter', () => {
  const PLAN_ID = '0b5e2c1d-6f4a-4e3b-9c8d-7a6b5c4d3e2f';
  const MODULE_ID = '1c6f3d2e-7a5b-4f4c-8d9e-8b7c6d5e4f30';
  const USER_ID = '2d7a4e3f-8b6c-4a5d-9e0f-9c8d7e6f5a41';

  beforeEach(() => {
    vi.clearAllMocks();
    lessonQueries.load.mockResolvedValue({
      plan: { id: PLAN_ID },
      module: { lessonGenerationStatus: 'not_generated' },
      tasks: [],
      isUnlocked: true,
    });
    lessonQueries.claim.mockResolvedValue({
      kind: 'claimed',
      workflowStartedAt: null,
    });
  });

  function startParams(correlationId = 'attempt-1') {
    return {
      dbClient: makeDbClient(),
      userId: USER_ID,
      planId: PLAN_ID,
      moduleId: MODULE_ID,
      correlationId,
    };
  }

  it('creates the instance directly even when MODULE_LESSONS_RUNTIME=cloudflare', async () => {
    vi.stubEnv('MODULE_LESSONS_RUNTIME', 'cloudflare');
    try {
      const workflow = { create: vi.fn(async () => ({}) as WorkflowInstance) };
      const start = createWorkflowModuleLessonStarter({
        workflow,
        isEnabled: () => true,
      });

      const result = await start(startParams());

      const instanceId = `lessons-${MODULE_ID}-attempt-1`;
      expect(result).toEqual({ kind: 'workflow_started', runId: instanceId });
      expect(workflow.create).toHaveBeenCalledOnce();
      expect(workflow.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: instanceId }),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('claims on the invocation db, then creates the instance directly', async () => {
    const workflow = { create: vi.fn(async () => ({}) as WorkflowInstance) };
    const start = createWorkflowModuleLessonStarter({
      workflow,
      isEnabled: () => true,
    });
    const params = startParams();

    const result = await start(params);

    const instanceId = `lessons-${MODULE_ID}-attempt-1`;
    expect(result).toEqual({ kind: 'workflow_started', runId: instanceId });
    expect(lessonQueries.claim).toHaveBeenCalledWith(
      params.dbClient,
      PLAN_ID,
      MODULE_ID,
      USER_ID,
      { batchRequestId: 'attempt-1' },
    );
    expect(workflow.create).toHaveBeenCalledWith({
      id: instanceId,
      params: {
        v: 1,
        planId: PLAN_ID,
        moduleId: MODULE_ID,
        userId: USER_ID,
        batchRequestId: 'attempt-1',
        correlationId: 'attempt-1',
      },
    });
    expect(instanceId).toMatch(/^[A-Za-z0-9_][A-Za-z0-9_-]{0,99}$/);
  });

  it('hashes a correlation ID that is not instance-ID safe', async () => {
    const workflow = { create: vi.fn(async () => ({}) as WorkflowInstance) };
    const start = createWorkflowModuleLessonStarter({
      workflow,
      isEnabled: () => true,
    });

    await start(startParams('req:abc/def 123'));

    const [[{ id }]] = workflow.create.mock.calls as unknown as [
      [{ id: string }],
    ];
    expect(id).toMatch(new RegExp(`^lessons-${MODULE_ID}-[0-9a-f]{32}$`));
    expect(id.length).toBeLessThanOrEqual(100);
  });

  it('does not claim or create while the lessons switch is off', async () => {
    const workflow = { create: vi.fn() };
    const start = createWorkflowModuleLessonStarter({
      workflow,
      isEnabled: () => false,
    });

    await expect(start(startParams())).resolves.toEqual({ kind: 'disabled' });
    expect(lessonQueries.claim).not.toHaveBeenCalled();
    expect(workflow.create).not.toHaveBeenCalled();
  });

  it('reverts the provisional claim when create throws', async () => {
    const workflow = {
      create: vi.fn(async () => {
        throw new Error('create failed');
      }),
    };
    const start = createWorkflowModuleLessonStarter({
      workflow,
      isEnabled: () => true,
    });
    const params = startParams();

    await expect(start(params)).resolves.toMatchObject({
      kind: 'workflow_start_failed',
    });
    expect(lessonQueries.revert).toHaveBeenCalledWith(params.dbClient, {
      userId: USER_ID,
      planId: PLAN_ID,
      moduleId: MODULE_ID,
      batchRequestId: 'attempt-1',
    });
  });
});
