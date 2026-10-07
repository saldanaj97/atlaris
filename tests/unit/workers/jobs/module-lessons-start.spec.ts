import {
  handleModuleLessonsStart,
  type ModuleLessonsStartDeps,
} from '../../../../workers/jobs/src/http/module-lessons-start';
import {
  computeJobsSignature,
  JOBS_COMMAND_PATHS,
  JOBS_SIGNATURE_HEADER,
  JOBS_TIMESTAMP_HEADER,
} from '@/lib/jobs-worker/contract';
import { describe, expect, it, vi } from 'vitest';

const SECRET = 'current-secret-0123456789abcdef0123456789';
const NOW_MS = 1_790_000_000_000;
const PATH = JOBS_COMMAND_PATHS.moduleLessonsStart;
const PLAN_ID = '0b5e2c1d-6f4a-4e3b-9c8d-7a6b5c4d3e2f';
const MODULE_ID = '1c6f3d2e-7a5b-4f4c-8d9e-8b7c6d5e4f30';
const USER_ID = '2d7a4e3f-8b6c-4a5d-9e0f-9c8d7e6f5a41';
const INSTANCE_ID = `lessons-${MODULE_ID}-batch_1`;

const command = {
  v: 1,
  planId: PLAN_ID,
  moduleId: MODULE_ID,
  userId: USER_ID,
  batchRequestId: 'batch_1',
  correlationId: 'req-1',
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
  workflow: Partial<ModuleLessonsStartDeps['workflow']> = {},
) {
  const create = vi.fn(async () => ({}) as WorkflowInstance);
  const get = vi.fn(async () => ({}) as WorkflowInstance);
  const deps: ModuleLessonsStartDeps = {
    env: {
      JOBS_SIGNING_SECRET: SECRET,
      JOB_MODULE_LESSONS_ENABLED: 'true',
      ...env,
    },
    workflow: { create, get, ...workflow },
    logger: { info: vi.fn(), error: vi.fn() },
    nowMs: NOW_MS,
  };
  return { deps, create, get };
}

describe('handleModuleLessonsStart', () => {
  it('creates the instance and answers 202 with its ID', async () => {
    const { deps, create } = makeDeps();

    const response = await handleModuleLessonsStart(
      await signed(JSON.stringify(command)),
      deps,
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      instanceId: INSTANCE_ID,
    });
    expect(create).toHaveBeenCalledWith({ id: INSTANCE_ID, params: command });
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

    const response = await handleModuleLessonsStart(
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

    const response = await handleModuleLessonsStart(
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
    ['a non-UUID module', JSON.stringify({ ...command, moduleId: 'm-1' })],
    [
      'a missing batch request ID',
      JSON.stringify({ ...command, batchRequestId: '' }),
    ],
  ])('answers 400 for %s', async (_label, body) => {
    const { deps, create } = makeDeps();

    const response = await handleModuleLessonsStart(await signed(body), deps);

    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('answers 401 for a bad signature without creating anything', async () => {
    const { deps, create } = makeDeps();

    const response = await handleModuleLessonsStart(
      await signed(JSON.stringify(command), 'wrong-secret'),
      deps,
    );

    expect(response.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    [
      'jobs_paused',
      { JOBS_PAUSED: 'true', JOB_MODULE_LESSONS_ENABLED: 'true' },
    ],
    ['job_disabled', { JOB_MODULE_LESSONS_ENABLED: 'false' }],
  ])('answers 503 %s', async (code, env) => {
    const { deps, create } = makeDeps(env);

    const response = await handleModuleLessonsStart(
      await signed(JSON.stringify(command)),
      deps,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code });
    expect(create).not.toHaveBeenCalled();
  });

  it('hashes a batch request ID that is not instance-ID safe', async () => {
    const { deps, create } = makeDeps();

    const response = await handleModuleLessonsStart(
      await signed(
        JSON.stringify({ ...command, batchRequestId: 'req:abc/def 123' }),
      ),
      deps,
    );

    expect(response.status).toBe(202);
    const { instanceId } = (await response.json()) as { instanceId: string };
    expect(instanceId).toMatch(
      new RegExp(`^lessons-${MODULE_ID}-[0-9a-f]{32}$`),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ id: instanceId }),
    );
  });
});
