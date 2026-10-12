import type { AttemptReservation } from '@/lib/db/queries/types/attempts.types';

import {
  handlePlanGenerationStart,
  type PlanGenerationStartDeps,
} from '../../../../workers/jobs/src/http/plan-generation-start';
import { toSerializableReservation } from '@/features/plans/workflows/plan-generation.types';
import {
  computeJobsSignature,
  JOBS_COMMAND_PATHS,
  JOBS_SIGNATURE_HEADER,
  JOBS_TIMESTAMP_HEADER,
  planGenerationStartCommandSchema,
} from '@/lib/jobs-worker/contract';
import { describe, expect, it, vi } from 'vitest';

const SECRET = 'current-secret-0123456789abcdef0123456789';
const NOW_MS = 1_790_000_000_000;
const PATH = JOBS_COMMAND_PATHS.planGenerationStart;
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

/** The body the app sends: `{ v: 1, ...PlanGenerationWorkflowInput }`. */
const command = {
  v: 1,
  planId: PLAN_ID,
  userId: USER_ID,
  tier: 'free',
  input: {
    topic: 'TypeScript',
    skillLevel: 'beginner',
    weeklyHours: 5,
    learningStyle: 'mixed',
    startDate: null,
    deadlineDate: '2026-12-01',
  },
  generationPurpose: 'initial',
  modelOverride: null,
  correlationId: 'req-1',
  reservation: toSerializableReservation(reservation),
  allowedGenerationStatuses: ['failed', 'pending_retry'],
};

async function signed(body: string, secret = SECRET): Promise<Request> {
  const timestamp = String(NOW_MS / 1000);
  const hex = await computeJobsSignature({
    secret,
    timestamp,
    method: 'POST',
    path: PATH,
    body,
  });
  return new Request(`https://workers-staging.atlaris.app${PATH}`, {
    method: 'POST',
    headers: {
      [JOBS_TIMESTAMP_HEADER]: timestamp,
      [JOBS_SIGNATURE_HEADER]: `v1=${hex}`,
    },
    body,
  });
}

function makeDeps(
  env: Record<string, string> = {},
  workflow: Partial<PlanGenerationStartDeps['workflow']> = {},
) {
  const create = vi.fn(async () => ({}) as WorkflowInstance);
  const get = vi.fn(async () => ({}) as WorkflowInstance);
  const deps: PlanGenerationStartDeps = {
    env: {
      JOBS_SIGNING_SECRET: SECRET,
      JOB_PLAN_GENERATION_ENABLED: 'true',
      ...env,
    },
    workflow: { create, get, ...workflow },
    logger: { info: vi.fn(), error: vi.fn() },
    nowMs: NOW_MS,
  };
  return { deps, create, get };
}

describe('handlePlanGenerationStart', () => {
  it('creates the instance for the attempt and answers 202 with its ID', async () => {
    const { deps, create } = makeDeps();

    const response = await handlePlanGenerationStart(
      await signed(JSON.stringify(command)),
      deps,
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      instanceId: INSTANCE_ID,
    });
    expect(create).toHaveBeenCalledWith({
      id: INSTANCE_ID,
      params: planGenerationStartCommandSchema.parse(command),
    });
  });

  it('answers 200 duplicate when the instance already exists', async () => {
    const { deps } = makeDeps(
      {},
      {
        create: vi.fn(async () => {
          throw new Error('instance.already_exists');
        }),
      },
    );

    const response = await handlePlanGenerationStart(
      await signed(JSON.stringify(command)),
      deps,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      duplicate: true,
    });
    expect(deps.workflow.get).toHaveBeenCalledWith(INSTANCE_ID);
  });

  it('answers 503 when create fails and no instance exists', async () => {
    const { deps } = makeDeps(
      {},
      {
        create: vi.fn(async () => {
          throw new Error('workflows unavailable');
        }),
        get: vi.fn(async () => {
          throw new Error('instance.not_found');
        }),
      },
    );

    const response = await handlePlanGenerationStart(
      await signed(JSON.stringify(command)),
      deps,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: 'workflow_start_failed',
    });
  });

  it.each([
    ['malformed JSON', '{'],
    ['an unknown field', JSON.stringify({ ...command, extra: true })],
    ['a missing version', JSON.stringify({ ...command, v: undefined })],
    [
      'a non-UUID attempt',
      JSON.stringify({
        ...command,
        reservation: { ...command.reservation, attemptId: 'attempt-1' },
      }),
    ],
    [
      'a regeneration purpose',
      JSON.stringify({ ...command, generationPurpose: 'regeneration' }),
    ],
    [
      'an unknown input field',
      JSON.stringify({ ...command, input: { ...command.input, extra: 1 } }),
    ],
  ])('answers 400 for %s', async (_label, body) => {
    const { deps, create } = makeDeps();

    const response = await handlePlanGenerationStart(await signed(body), deps);

    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('answers 401 for a bad signature without creating anything', async () => {
    const { deps, create } = makeDeps();

    const response = await handlePlanGenerationStart(
      await signed(JSON.stringify(command), 'wrong-secret'),
      deps,
    );

    expect(response.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    [
      'jobs_paused',
      { JOBS_PAUSED: 'true', JOB_PLAN_GENERATION_ENABLED: 'true' },
    ],
    ['job_disabled', { JOB_PLAN_GENERATION_ENABLED: 'false' }],
  ])('answers 503 %s', async (code, env) => {
    const { deps, create } = makeDeps(env);

    const response = await handlePlanGenerationStart(
      await signed(JSON.stringify(command)),
      deps,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code });
    expect(create).not.toHaveBeenCalled();
  });
});
