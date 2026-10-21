import type { AttemptReservation } from '@/lib/db/queries/types/attempts.types';
import type { DbClient } from '@/lib/db/types';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

import {
  type PlanGenerationWorkflowDeps,
  type PlanGenerationWorkflowParams,
  runPlanGenerationWorkflow,
} from '../../../../workers/jobs/src/workflows/plan-generation/run';
import { ProviderRateLimitError } from '@/features/ai/providers/errors';
import { createPlanLifecycleService } from '@/features/plans/lifecycle/factory';
import {
  fromSerializableReservation,
  type PlanGenerationWorkflowInput,
  toPlanGenerationProcessInput,
  toSerializableReservation,
} from '@/features/plans/workflows/plan-generation.types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mergeWorkflowMetadata: vi.fn(),
  commitSuccess: vi.fn(),
  commitFailure: vi.fn(),
  provider: { generate: vi.fn(), generateModuleLessonBatch: vi.fn() },
  runPlanResearch: vi.fn(),
  insertPlanResearch: vi.fn(),
  getLatestPlanResearch: vi.fn(),
  createGroundedOutlineProvider: vi.fn(),
  runOutlineVerifier: vi.fn(),
  runOutlineRepair: vi.fn(),
  insertQualityIssues: vi.fn(),
  listQualityIssues: vi.fn(),
}));

// The grounded writer, verifier and repair calls are covered with fixture
// streams in tests/unit/features/plans/outline.
vi.mock('@/features/plans/outline/grounded-writer', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/plans/outline/grounded-writer')
  >()),
  createGroundedOutlineProvider: mocks.createGroundedOutlineProvider,
}));
vi.mock('@/features/plans/outline/verifier', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/plans/outline/verifier')
  >()),
  runOutlineVerifier: mocks.runOutlineVerifier,
}));
vi.mock('@/features/plans/outline/repair', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/plans/outline/repair')>()),
  runOutlineRepair: mocks.runOutlineRepair,
}));
vi.mock('@/lib/db/queries/generation-quality-issues', () => ({
  insertGenerationQualityIssues: mocks.insertQualityIssues,
  listGenerationQualityIssuesForPlan: mocks.listQualityIssues,
}));

// The provider call is covered in tests/unit/features/plans/research.
vi.mock('@/features/plans/research/run-research', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/plans/research/run-research')
  >()),
  runPlanResearch: mocks.runPlanResearch,
}));

// The inserts are covered against Postgres in
// tests/integration/db/plan-research.queries.spec.ts.
vi.mock('@/lib/db/queries/plan-research', () => ({
  insertPlanResearch: mocks.insertPlanResearch,
  getLatestPlanResearch: mocks.getLatestPlanResearch,
}));

vi.mock('@/lib/db/queries/attempts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/queries/attempts')>()),
  mergeAttemptWorkflowMetadata: mocks.mergeWorkflowMetadata,
}));

// The finalization transactions are covered against Postgres in
// tests/integration/db/generation-finalization.spec.ts.
vi.mock('@/features/plans/lifecycle/generation-finalization/store', () => ({
  commitPlanGenerationSuccess: mocks.commitSuccess,
  commitPlanGenerationFailure: mocks.commitFailure,
}));

vi.mock('@/features/ai/model-resolver', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/ai/model-resolver')>()),
  resolveModelForTier: vi.fn(() => ({
    modelId: 'mock-model',
    provider: mocks.provider,
    fallback: false,
  })),
}));

const PLAN_ID = '0b5e2c1d-6f4a-4e3b-9c8d-7a6b5c4d3e2f';
const USER_ID = '2d7a4e3f-8b6c-4a5d-9e0f-9c8d7e6f5a41';
const ATTEMPT_ID = '5a0d7b6c-1e9f-4d8a-8b3c-2f1a0b9c8d74';
const INSTANCE_ID = `plan-${ATTEMPT_ID}`;
/** A reserved attempt as `reserveAttemptSlot` returns it. */
const reservation: AttemptReservation = {
  reserved: true,
  attemptId: ATTEMPT_ID,
  attemptNumber: 1,
  startedAt: new Date('2026-10-12T12:00:00.000Z'),
  sanitized: {
    topic: { value: 'TypeScript', truncated: false, originalLength: 10 },
    notes: { value: undefined, truncated: false, originalLength: undefined },
  },
  promptHash: 'prompt-hash',
  generationPurpose: 'initial',
};
const STARTED_AT = reservation.startedAt.toISOString();

const params = {
  v: 1,
  planId: PLAN_ID,
  userId: USER_ID,
  tier: 'free',
  input: {
    topic: 'TypeScript',
    skillLevel: 'beginner',
    weeklyHours: 5,
    learningStyle: 'mixed',
  },
  generationPurpose: 'initial',
  modelOverride: null,
  correlationId: 'req-1',
  reservation: toSerializableReservation(reservation),
} satisfies PlanGenerationWorkflowInput & { v: 1 };

const CLOUDFLARE_WORKFLOW = {
  provider: 'cloudflare-workflow',
  runId: INSTANCE_ID,
  startedAt: STARTED_AT,
} as const;

const PROVIDER_METADATA = {
  provider: 'mock',
  model: 'mock-model',
  usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
};

/** The attempt row `validateReservation` reads. */
let attemptRow: {
  status: 'in_progress' | 'success' | 'failure';
  classification: string | null;
};

function makeDb(): DbClient {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: async () => [
      {
        attemptId: ATTEMPT_ID,
        attemptStatus: attemptRow.status,
        generationPurpose: 'initial',
        classification: attemptRow.classification,
        planStatus: 'generating',
      },
    ],
  };
  return {
    select: () => chain,
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  } as unknown as DbClient;
}

function planText(modules: unknown = [validModule()]): string {
  return JSON.stringify({ modules });
}

function validModule() {
  return {
    title: 'Basics',
    description: 'Types and functions',
    estimatedMinutes: 60,
    tasks: [
      {
        title: 'Read the handbook',
        description: 'Ch. 1',
        estimatedMinutes: 30,
      },
    ],
  };
}

/** Passes every outline code check for `params.input`. */
function cleanModules() {
  return [
    {
      title: 'TypeScript types',
      estimatedMinutes: 60,
      tasks: [
        { title: 'Primitive types', estimatedMinutes: 30 },
        { title: 'Type inference', estimatedMinutes: 30 },
      ],
    },
    {
      title: 'TypeScript functions',
      estimatedMinutes: 60,
      tasks: [
        { title: 'Function signatures', estimatedMinutes: 30 },
        { title: 'Overloads', estimatedMinutes: 30 },
      ],
    },
  ];
}

function providerReturning(text: string) {
  mocks.provider.generate.mockImplementation(async () => ({
    stream: new ReadableStream<string>({
      start(controller) {
        controller.enqueue(text);
        controller.close();
      },
    }),
    metadata: PROVIDER_METADATA,
  }));
}

type StepCall = {
  name: string;
  attempts: number;
  config: { retries: { limit: number }; timeout?: number };
};

/** Runs each step like Workflows does: retries until the limit or a NonRetryableError. */
function createStep() {
  const calls: StepCall[] = [];
  const step = {
    async do(
      name: string,
      config: StepCall['config'],
      callback: (ctx: { attempt: number }) => Promise<unknown>,
    ) {
      const call = { name, attempts: 0, config };
      calls.push(call);
      for (let attempt = 1; ; attempt += 1) {
        call.attempts = attempt;
        try {
          return await callback({ attempt });
        } catch (error) {
          if (
            (error as Error).name === 'NonRetryableError' ||
            attempt > config.retries.limit
          ) {
            throw error;
          }
        }
      }
    },
  };
  return { step: step as unknown as Pick<WorkflowStep, 'do'>, calls };
}

function event(
  payload: unknown = params,
): WorkflowEvent<PlanGenerationWorkflowParams> {
  return {
    payload: payload as PlanGenerationWorkflowParams,
    timestamp: new Date('2026-10-12T12:00:00.000Z'),
    instanceId: INSTANCE_ID,
    workflowName: 'atlaris-plan-generation-staging',
  };
}

function makeDeps(overrides: Partial<PlanGenerationWorkflowDeps> = {}) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const deps: PlanGenerationWorkflowDeps = {
    isEnabled: () => true,
    // Grounded generation off: today's pipeline.
    isGroundedEnabled: () => false,
    withDb: (fn) => fn(makeDb()),
    startModuleLessons: vi.fn(),
    logger,
    nonRetryable: (message) =>
      Object.assign(new Error(message), { name: 'NonRetryableError' }),
    ...overrides,
  };
  return { deps, logger };
}

function stepLogs(logger: {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
}) {
  return [...logger.info.mock.calls, ...logger.warn.mock.calls]
    .map(([fields]) => fields as Record<string, unknown>)
    .filter(
      (fields) => fields.job === 'plan-generation' && 'outcome' in fields,
    );
}

describe('runPlanGenerationWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    attemptRow = { status: 'in_progress', classification: null };
    mocks.mergeWorkflowMetadata.mockResolvedValue(undefined);
    mocks.commitSuccess.mockImplementation(async () => {
      attemptRow.status = 'success';
      return { id: ATTEMPT_ID };
    });
    mocks.commitFailure.mockImplementation(async (_db, input) => {
      attemptRow = { status: 'failure', classification: input.classification };
      return { id: ATTEMPT_ID };
    });
    providerReturning(planText());
    mocks.createGroundedOutlineProvider.mockReturnValue(mocks.provider);
  });

  it('records the instance, generates once, and finalizes with usage and lessons', async () => {
    const { deps, logger } = makeDeps();
    const { step, calls } = createStep();

    await expect(
      runPlanGenerationWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'success' });

    expect(calls.map((call) => [call.name, call.attempts])).toEqual([
      ['record-workflow', 1],
      ['generate', 1],
      ['finalize', 1],
    ]);
    expect(calls[1]?.config.retries.limit).toBe(0);
    expect(calls[1]?.config.timeout).toBeGreaterThan(60_000);

    expect(mocks.mergeWorkflowMetadata).toHaveBeenCalledWith(
      expect.anything(),
      ATTEMPT_ID,
      CLOUDFLARE_WORKFLOW,
    );
    expect(mocks.provider.generate).toHaveBeenCalledOnce();
    expect(mocks.commitSuccess).toHaveBeenCalledOnce();
    const [, finalizeInput, storeDeps] = mocks.commitSuccess.mock.calls[0]!;
    expect(finalizeInput).toEqual({
      planId: PLAN_ID,
      userId: USER_ID,
      attemptId: ATTEMPT_ID,
      preparation: fromSerializableReservation(params.reservation),
      modules: [validModule()],
      providerMetadata: PROVIDER_METADATA,
      usage: expect.objectContaining({
        inputTokens: 10,
        outputTokens: 20,
        provider: 'mock',
        model: 'mock-model',
      }),
      durationMs: expect.any(Number),
      // The first module arrived well inside the threshold, so the adaptive
      // timeout extended, exactly as on Vercel.
      extendedTimeout: true,
      workflowMetadata: {
        ...CLOUDFLARE_WORKFLOW,
        completedAt: expect.any(String),
      },
      usageKind: 'plan',
      generationPurpose: 'initial',
    });
    // Lessons for the first modules start through the Worker's starter.
    expect(storeDeps).toEqual({ startModuleLessons: deps.startModuleLessons });
    expect(mocks.commitFailure).not.toHaveBeenCalled();

    expect(
      stepLogs(logger).map((fields) => [fields.step, fields.outcome]),
    ).toEqual([
      ['record-workflow', 'recorded'],
      ['generate', 'generated'],
      ['finalize', 'success'],
    ]);
    expect(
      stepLogs(logger).find((fields) => fields.step === 'generate'),
    ).toMatchObject({
      instanceId: INSTANCE_ID,
      planId: PLAN_ID,
      attemptId: ATTEMPT_ID,
      taskCount: 1,
    });
  });

  it('does not retry a provider failure and settles it retryable without usage', async () => {
    mocks.provider.generate.mockRejectedValue(new ProviderRateLimitError());
    const { deps } = makeDeps();
    const { step, calls } = createStep();

    await expect(
      runPlanGenerationWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'retryable_failure' });

    expect(calls.map((call) => [call.name, call.attempts])).toEqual([
      ['record-workflow', 1],
      ['generate', 1],
      ['finalize', 1],
    ]);
    expect(mocks.provider.generate).toHaveBeenCalledOnce();
    expect(mocks.commitSuccess).not.toHaveBeenCalled();
    expect(mocks.commitFailure).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        variant: 'reserved_attempt',
        attemptId: ATTEMPT_ID,
        classification: 'rate_limit',
        retryable: true,
        usage: undefined,
        workflowMetadata: {
          ...CLOUDFLARE_WORKFLOW,
          completedAt: expect.any(String),
        },
      }),
    );
  });

  it('settles invalid JSON as a retryable provider error, as on Vercel', async () => {
    providerReturning('not json');
    const { deps } = makeDeps();
    const { step, calls } = createStep();

    await expect(
      runPlanGenerationWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'retryable_failure' });

    expect(calls.map((call) => call.attempts)).toEqual([1, 1, 1]);
    expect(mocks.commitFailure).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        classification: 'provider_error',
        retryable: true,
      }),
    );
  });

  it('settles a validation failure as permanent with usage and never retries it', async () => {
    providerReturning(planText([]));
    const { deps, logger } = makeDeps();
    const { step, calls } = createStep();

    await expect(
      runPlanGenerationWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'permanent_failure' });

    expect(calls.map((call) => [call.name, call.attempts])).toEqual([
      ['record-workflow', 1],
      ['generate', 1],
      ['finalize', 1],
    ]);
    expect(mocks.provider.generate).toHaveBeenCalledOnce();
    expect(mocks.commitFailure).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        classification: 'validation',
        retryable: false,
        usage: expect.objectContaining({ inputTokens: 10, outputTokens: 20 }),
      }),
    );
    expect(
      stepLogs(logger).find((fields) => fields.step === 'generate'),
    ).toMatchObject({ outcome: 'failed', errorKind: 'validation' });
  });

  it('settles the attempt as retryable without a provider call when the switch is off', async () => {
    const { deps } = makeDeps({ isEnabled: () => false });
    const { step, calls } = createStep();

    await expect(
      runPlanGenerationWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'disabled' });

    expect(calls.map((call) => call.name)).toEqual([
      'record-workflow',
      'generate',
      'finalize',
    ]);
    expect(mocks.provider.generate).not.toHaveBeenCalled();
    expect(mocks.commitFailure).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        variant: 'reserved_attempt',
        classification: 'provider_error',
        retryable: true,
        durationMs: 0,
        workflowMetadata: {
          ...CLOUDFLARE_WORKFLOW,
          completedAt: STARTED_AT,
        },
      }),
    );
    expect(attemptRow.status).toBe('failure');
  });

  it('does not finalize twice when a retry finds its own commit already landed', async () => {
    mocks.commitSuccess.mockImplementationOnce(async () => {
      attemptRow.status = 'success';
      throw new Error('connection reset');
    });
    const { deps } = makeDeps();
    const { step, calls } = createStep();

    await expect(
      runPlanGenerationWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'already_finalized' });

    expect(calls.at(-1)).toMatchObject({ name: 'finalize', attempts: 2 });
    expect(mocks.commitSuccess).toHaveBeenCalledOnce();
    expect(mocks.commitFailure).not.toHaveBeenCalled();
  });

  it('skips provider work and finalization for an attempt already finalized', async () => {
    attemptRow = { status: 'success', classification: null };
    const { deps } = makeDeps();
    const { step, calls } = createStep();

    await expect(
      runPlanGenerationWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'already_finalized' });

    expect(calls.map((call) => call.name)).toEqual([
      'record-workflow',
      'generate',
    ]);
    expect(mocks.provider.generate).not.toHaveBeenCalled();
    expect(mocks.commitSuccess).not.toHaveBeenCalled();
    expect(mocks.commitFailure).not.toHaveBeenCalled();
  });

  it('settles a retryable failure when a step exhausts its retries', async () => {
    mocks.mergeWorkflowMetadata.mockRejectedValue(new Error('db down'));
    const { deps } = makeDeps();
    const { step, calls } = createStep();

    await expect(
      runPlanGenerationWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'failed' });

    expect(calls.map((call) => [call.name, call.attempts])).toEqual([
      ['record-workflow', 4],
      ['fail', 1],
    ]);
    expect(mocks.provider.generate).not.toHaveBeenCalled();
    expect(mocks.commitFailure).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        classification: 'provider_error',
        retryable: true,
        workflowMetadata: expect.objectContaining(CLOUDFLARE_WORKFLOW),
      }),
    );
  });

  it('leaves an attempt that is already finalized alone on failure', async () => {
    mocks.commitSuccess.mockImplementation(async () => {
      attemptRow.status = 'success';
      throw new Error('connection reset');
    });
    // Both finalize retries lose their connection, so the step gives up.
    let opens = 0;
    const { deps } = makeDeps({
      withDb: (fn) => {
        opens += 1;
        if (opens === 4 || opens === 5) {
          return Promise.reject(new Error('db down'));
        }
        return fn(makeDb());
      },
    });
    const { step, calls } = createStep();

    await expect(
      runPlanGenerationWorkflow(event(), step, deps),
    ).resolves.toEqual({ kind: 'failed' });

    expect(calls.map((call) => [call.name, call.attempts])).toEqual([
      ['record-workflow', 1],
      ['generate', 1],
      ['finalize', 3],
      ['fail', 1],
    ]);
    expect(mocks.commitSuccess).toHaveBeenCalledOnce();
    expect(mocks.commitFailure).not.toHaveBeenCalled();
  });

  it.each([
    ['success', () => providerReturning(planText())],
    ['invalid JSON', () => providerReturning('not json')],
    ['a validation failure', () => providerReturning(planText([]))],
    [
      'a provider error',
      () =>
        mocks.provider.generate.mockRejectedValue(new Error('upstream 500')),
    ],
  ])(
    'settles %s with the same input as the one-call lifecycle method',
    async (_label, arrangeProvider) => {
      const { deps } = makeDeps();
      arrangeProvider();
      await runPlanGenerationWorkflow(event(), createStep().step, deps);

      attemptRow = { status: 'in_progress', classification: null };
      arrangeProvider();
      // What `processGenerationAttemptWithReservation` runs in one call, with this instance's marker.
      await createPlanLifecycleService({
        dbClient: makeDb(),
        startModuleLessons: deps.startModuleLessons,
      }).processGenerationAttemptWithReservation(
        toPlanGenerationProcessInput(params, 'initial', CLOUDFLARE_WORKFLOW),
        fromSerializableReservation(params.reservation),
      );

      const settled = [
        ...mocks.commitSuccess.mock.calls,
        ...mocks.commitFailure.mock.calls,
      ].map(([, input, storeDeps]) => {
        // Timing differs per run; finalization never persists the error.
        const { durationMs, workflowMetadata, error, ...rest } = input;
        return {
          ...rest,
          durationMs: typeof durationMs,
          workflowMetadata: { ...workflowMetadata, completedAt: 'set' },
          error: error instanceof Error,
          storeDeps,
        };
      });
      expect(settled).toHaveLength(2);
      expect(settled[0]).toEqual(settled[1]);
    },
  );

  it('rejects invalid params without running a step', async () => {
    const { deps } = makeDeps();
    const { step, calls } = createStep();

    await expect(
      runPlanGenerationWorkflow(event({ v: 1 }), step, deps),
    ).rejects.toMatchObject({ name: 'NonRetryableError' });
    expect(calls).toEqual([]);
  });

  describe('grounded research (JCS-158)', () => {
    const RESEARCH = {
      brief: 'Types first [S1].',
      sources: [
        {
          key: 'S1',
          title: 'Handbook',
          url: 'https://www.typescriptlang.org/docs/handbook/',
          publisher: 'typescriptlang.org',
        },
      ],
    } as const;

    beforeEach(() => {
      mocks.runPlanResearch.mockResolvedValue({
        research: RESEARCH,
        droppedSourceCount: 1,
        mode: 'fast',
        searchCount: 3,
        costMicrousd: 21_500,
        model: 'served/model',
      });
      mocks.insertPlanResearch.mockResolvedValue(undefined);
      mocks.getLatestPlanResearch.mockResolvedValue(null);
      // A clean outline: no outline repair on free (covered under JCS-159).
      providerReturning(planText(cleanModules()));
    });

    it('researches once, saves the brief and sources, then generates', async () => {
      const { deps, logger } = makeDeps({ isGroundedEnabled: () => true });
      const { step, calls } = createStep();

      await expect(
        runPlanGenerationWorkflow(event(), step, deps),
      ).resolves.toEqual({ kind: 'success' });

      expect(calls.map((call) => [call.name, call.attempts])).toEqual([
        ['record-workflow', 1],
        ['research', 1],
        ['research-save', 1],
        ['generate', 1],
        ['finalize', 1],
      ]);
      expect(calls[1]?.config.retries.limit).toBe(2);
      expect(mocks.createGroundedOutlineProvider).toHaveBeenCalledWith({
        tier: 'free',
        purpose: 'initial',
        modelOverride: null,
        research: RESEARCH,
      });
      expect(mocks.runPlanResearch).toHaveBeenCalledWith({
        tier: 'free',
        input: params.input,
      });
      expect(mocks.insertPlanResearch).toHaveBeenCalledWith(
        {
          research: {
            planId: PLAN_ID,
            brief: RESEARCH.brief,
            mode: 'fast',
            status: 'ok',
            searchCount: 3,
            costMicrousd: 21_500,
          },
          sources: [
            {
              citationKey: 'S1',
              url: RESEARCH.sources[0].url,
              title: 'Handbook',
              publisher: 'typescriptlang.org',
            },
          ],
        },
        expect.anything(),
      );
      expect(
        stepLogs(logger).find((fields) => fields.step === 'research'),
      ).toMatchObject({
        outcome: 'researched',
        model: 'served/model',
        sourceCount: 1,
        droppedSourceCount: 1,
        searchCount: 3,
      });
    });

    it('retries research twice, then saves failed_skipped and still generates', async () => {
      mocks.runPlanResearch.mockRejectedValue(new Error('provider down'));
      const { deps, logger } = makeDeps({ isGroundedEnabled: () => true });
      const { step, calls } = createStep();

      await expect(
        runPlanGenerationWorkflow(event(), step, deps),
      ).resolves.toEqual({ kind: 'success' });

      expect(calls.map((call) => [call.name, call.attempts])).toEqual([
        ['record-workflow', 1],
        ['research', 3],
        ['research-save', 1],
        ['generate', 1],
        ['finalize', 1],
      ]);
      expect(mocks.runPlanResearch).toHaveBeenCalledTimes(3);
      expect(mocks.insertPlanResearch).toHaveBeenCalledWith(
        {
          research: {
            planId: PLAN_ID,
            brief: '',
            mode: 'fast',
            status: 'failed_skipped',
            searchCount: 0,
            costMicrousd: null,
          },
          sources: [],
        },
        expect.anything(),
      );
      expect(mocks.provider.generate).toHaveBeenCalledOnce();
      // No brief: the grounded outline runs with the contract only.
      expect(mocks.createGroundedOutlineProvider).toHaveBeenCalledWith(
        expect.objectContaining({ research: null }),
      );
      expect(
        stepLogs(logger)
          .filter((fields) => String(fields.step).startsWith('research'))
          .map((fields) => [fields.step, fields.outcome]),
      ).toEqual([
        // `stepLogs` lists info entries before warn entries.
        ['research-save', 'saved_failed_skipped'],
        ['research', 'failed_skipped'],
      ]);
    });

    it('does not insert again when a save retry finds its row', async () => {
      mocks.insertPlanResearch
        .mockRejectedValueOnce(new Error('connection reset'))
        .mockResolvedValue(undefined);
      mocks.getLatestPlanResearch.mockResolvedValue({
        research: { createdAt: new Date(reservation.startedAt.getTime() + 1) },
        sources: [],
      });
      const { deps } = makeDeps({ isGroundedEnabled: () => true });
      const { step, calls } = createStep();

      await runPlanGenerationWorkflow(event(), step, deps);

      expect(calls.find((call) => call.name === 'research-save')).toMatchObject(
        { attempts: 2 },
      );
      expect(mocks.insertPlanResearch).toHaveBeenCalledOnce();
      expect(mocks.runPlanResearch).toHaveBeenCalledOnce();
    });

    it('skips research without a search when the switch is off', async () => {
      const { deps } = makeDeps({
        isEnabled: () => false,
        isGroundedEnabled: () => true,
      });
      const { step, calls } = createStep();

      await expect(
        runPlanGenerationWorkflow(event(), step, deps),
      ).resolves.toEqual({ kind: 'disabled' });

      expect(calls.map((call) => call.name)).toEqual([
        'record-workflow',
        'generate',
        'finalize',
      ]);
      expect(mocks.runPlanResearch).not.toHaveBeenCalled();
      expect(mocks.insertPlanResearch).not.toHaveBeenCalled();
    });

    it('leaves the flow unchanged when grounded generation is off', async () => {
      const { deps } = makeDeps();
      const { step, calls } = createStep();

      await runPlanGenerationWorkflow(event(), step, deps);

      expect(calls.map((call) => call.name)).toEqual([
        'record-workflow',
        'generate',
        'finalize',
      ]);
      expect(mocks.runPlanResearch).not.toHaveBeenCalled();
      expect(mocks.insertPlanResearch).not.toHaveBeenCalled();
      expect(mocks.createGroundedOutlineProvider).not.toHaveBeenCalled();
      expect(mocks.runOutlineVerifier).not.toHaveBeenCalled();
      expect(mocks.runOutlineRepair).not.toHaveBeenCalled();
      expect(mocks.insertQualityIssues).not.toHaveBeenCalled();
    });
  });

  describe('grounded outline (JCS-159)', () => {
    const RESEARCH = { brief: 'Types first.', sources: [] } as const;
    const VERIFIER_ISSUE = {
      code: 'verifier.too_advanced',
      blockRef: 'modules[1]',
      message: 'Overloads are too advanced for a beginner.',
      source: 'verifier',
    } as const;

    /** Fails only the module and lesson counts. */
    function thinModule(title = 'TypeScript basics') {
      return {
        title,
        estimatedMinutes: 30,
        tasks: [{ title: `${title} lesson`, estimatedMinutes: 30 }],
      };
    }

    function groundedEvent(tier: 'free' | 'starter' | 'pro') {
      return event({ ...params, tier });
    }

    function finalizedModules() {
      return mocks.commitSuccess.mock.calls[0]?.[1].modules;
    }

    function savedIssues() {
      return (
        mocks.insertQualityIssues.mock.calls[0]![0] as {
          issueCode: string;
          blockRef: string;
          pass: number;
          resolved: boolean;
          stage: string;
        }[]
      ).map((record) => [
        record.issueCode,
        record.blockRef,
        record.pass,
        record.resolved,
      ]);
    }

    beforeEach(() => {
      mocks.runPlanResearch.mockResolvedValue({
        research: RESEARCH,
        droppedSourceCount: 0,
        mode: 'fast',
        searchCount: 1,
        costMicrousd: 1_000,
        model: 'served/model',
      });
      mocks.insertPlanResearch.mockResolvedValue(undefined);
      mocks.getLatestPlanResearch.mockResolvedValue(null);
      mocks.runOutlineVerifier.mockResolvedValue({
        issues: [],
        model: 'verifier/model',
      });
      mocks.runOutlineRepair.mockResolvedValue({
        modules: cleanModules(),
        model: 'repair/model',
      });
      mocks.insertQualityIssues.mockResolvedValue([]);
      mocks.listQualityIssues.mockResolvedValue([]);
      providerReturning(planText([thinModule()]));
    });

    it('runs code checks only on free, repairs once and logs resolved issues', async () => {
      const { deps } = makeDeps({ isGroundedEnabled: () => true });
      const { step, calls } = createStep();

      await expect(
        runPlanGenerationWorkflow(groundedEvent('free'), step, deps),
      ).resolves.toEqual({ kind: 'success' });

      expect(calls.map((call) => [call.name, call.attempts])).toEqual([
        ['record-workflow', 1],
        ['research', 1],
        ['research-save', 1],
        ['generate', 1],
        ['outline-repair', 1],
        ['outline-quality-save', 1],
        ['finalize', 1],
      ]);
      expect(
        calls.find((call) => call.name === 'outline-repair')?.config.retries
          .limit,
      ).toBe(0);
      expect(mocks.runOutlineVerifier).not.toHaveBeenCalled();
      expect(mocks.runOutlineRepair).toHaveBeenCalledOnce();
      expect(mocks.runOutlineRepair).toHaveBeenCalledWith(
        expect.objectContaining({
          tier: 'free',
          purpose: 'initial',
          research: RESEARCH,
          modules: [thinModule()],
          issues: [
            expect.objectContaining({ code: 'module_count', blockRef: 'plan' }),
            expect.objectContaining({
              code: 'lesson_count',
              blockRef: 'modules[0]',
            }),
          ],
        }),
      );
      expect(savedIssues()).toEqual([
        ['module_count', 'plan', 0, true],
        ['lesson_count', 'modules[0]', 0, true],
      ]);
      expect(mocks.insertQualityIssues.mock.calls[0]?.[0][0]).toMatchObject({
        planId: PLAN_ID,
        stage: 'outline',
      });
      expect(finalizedModules()).toEqual(cleanModules());
    });

    it('verifies on starter, repairs once, reverifies and logs the outcome', async () => {
      providerReturning(planText(cleanModules()));
      mocks.runOutlineVerifier
        .mockResolvedValueOnce({ issues: [VERIFIER_ISSUE], model: 'v/model' })
        .mockResolvedValueOnce({ issues: [], model: 'v/model' });
      const { deps } = makeDeps({ isGroundedEnabled: () => true });
      const { step, calls } = createStep();

      await expect(
        runPlanGenerationWorkflow(groundedEvent('starter'), step, deps),
      ).resolves.toEqual({ kind: 'success' });

      expect(calls.map((call) => call.name)).toEqual([
        'record-workflow',
        'research',
        'research-save',
        'generate',
        'outline-verify',
        'outline-repair',
        'outline-reverify',
        'outline-quality-save',
        'finalize',
      ]);
      expect(mocks.runOutlineVerifier).toHaveBeenCalledTimes(2);
      expect(mocks.runOutlineVerifier).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ tier: 'starter', research: RESEARCH }),
      );
      expect(mocks.runOutlineRepair).toHaveBeenCalledOnce();
      expect(savedIssues()).toEqual([
        ['verifier.too_advanced', 'modules[1]', 0, true],
      ]);
    });

    it('repairs only once and logs the issues that remain', async () => {
      mocks.runOutlineRepair.mockResolvedValue({
        modules: [thinModule(), thinModule('TypeScript functions')],
        model: 'repair/model',
      });
      const { deps } = makeDeps({ isGroundedEnabled: () => true });
      const { step } = createStep();

      await runPlanGenerationWorkflow(groundedEvent('free'), step, deps);

      expect(mocks.runOutlineRepair).toHaveBeenCalledOnce();
      expect(savedIssues()).toEqual([
        ['module_count', 'plan', 0, true],
        ['lesson_count', 'modules[0]', 0, false],
        ['lesson_count', 'modules[1]', 1, false],
      ]);
      expect(finalizedModules()).toHaveLength(2);
    });

    it('finalizes the first outline and logs every issue open when the repair fails', async () => {
      mocks.runOutlineRepair.mockRejectedValue(new Error('provider down'));
      const { deps, logger } = makeDeps({ isGroundedEnabled: () => true });
      const { step, calls } = createStep();

      await expect(
        runPlanGenerationWorkflow(groundedEvent('free'), step, deps),
      ).resolves.toEqual({ kind: 'success' });

      expect(
        calls.find((call) => call.name === 'outline-repair'),
      ).toMatchObject({ attempts: 1 });
      expect(savedIssues()).toEqual([
        ['module_count', 'plan', 0, false],
        ['lesson_count', 'modules[0]', 0, false],
      ]);
      expect(finalizedModules()).toEqual([thinModule()]);
      expect(
        stepLogs(logger).find((fields) => fields.step === 'outline-repair'),
      ).toMatchObject({ outcome: 'failed_skipped' });
    });

    it('retries a failing verifier once, then continues on code checks alone', async () => {
      providerReturning(planText(cleanModules()));
      mocks.runOutlineVerifier.mockRejectedValue(new Error('bad output'));
      const { deps } = makeDeps({ isGroundedEnabled: () => true });
      const { step, calls } = createStep();

      await expect(
        runPlanGenerationWorkflow(groundedEvent('pro'), step, deps),
      ).resolves.toEqual({ kind: 'success' });

      expect(calls.map((call) => [call.name, call.attempts])).toEqual([
        ['record-workflow', 1],
        ['research', 1],
        ['research-save', 1],
        ['generate', 1],
        ['outline-verify', 2],
        ['finalize', 1],
      ]);
      expect(mocks.runOutlineRepair).not.toHaveBeenCalled();
      expect(mocks.insertQualityIssues).not.toHaveBeenCalled();
      expect(finalizedModules()).toEqual(cleanModules());
    });

    it('skips repair and logging when the outline passes every check', async () => {
      providerReturning(planText(cleanModules()));
      const { deps } = makeDeps({ isGroundedEnabled: () => true });
      const { step, calls } = createStep();

      await runPlanGenerationWorkflow(groundedEvent('starter'), step, deps);

      expect(calls.map((call) => call.name)).toEqual([
        'record-workflow',
        'research',
        'research-save',
        'generate',
        'outline-verify',
        'finalize',
      ]);
      expect(mocks.runOutlineRepair).not.toHaveBeenCalled();
      expect(mocks.insertQualityIssues).not.toHaveBeenCalled();
    });

    it('does not insert again when a save retry finds its rows', async () => {
      mocks.insertQualityIssues
        .mockRejectedValueOnce(new Error('connection reset'))
        .mockResolvedValue([]);
      mocks.listQualityIssues.mockResolvedValue([
        {
          stage: 'outline',
          createdAt: new Date(reservation.startedAt.getTime() + 1),
        },
      ]);
      const { deps } = makeDeps({ isGroundedEnabled: () => true });
      const { step, calls } = createStep();

      await runPlanGenerationWorkflow(groundedEvent('free'), step, deps);

      expect(
        calls.find((call) => call.name === 'outline-quality-save'),
      ).toMatchObject({ attempts: 2 });
      expect(mocks.insertQualityIssues).toHaveBeenCalledOnce();
    });
  });
});
