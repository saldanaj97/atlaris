import { createDefaultHandlers } from '../helpers/workerHelpers';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { GET as GET_PLAN } from '@/app/api/v1/plans/[planId]/route';
import { GET as GET_STATUS } from '@/app/api/v1/plans/[planId]/status/route';
import { POST as POST_PLAN } from '@/app/api/v1/plans/route';
import { db } from '@/lib/db/drizzle';
import {
  generationAttempts,
  jobQueue,
  learningPlans,
  modules,
  tasks,
} from '@/lib/db/schema';
import { getJobsByPlanId } from '@/lib/jobs/queue';
import { type PlanGenerationJobResult } from '@/lib/jobs/types';
import type { ProcessPlanGenerationJobResult } from '@/lib/jobs/worker-service';
import * as workerService from '@/lib/jobs/worker-service';
import { PlanGenerationWorker } from '@/workers/plan-generator';
import { eq, inArray } from 'drizzle-orm';

import { setTestUser } from '../helpers/auth';
import { ensureUser } from '../helpers/db';

const BASE_URL = 'http://localhost/api/v1/plans';

const ORIGINAL_ENV = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  MOCK_GENERATION_FAILURE_RATE: process.env.MOCK_GENERATION_FAILURE_RATE,
  MOCK_GENERATION_DELAY_MS: process.env.MOCK_GENERATION_DELAY_MS,
  ENABLE_CURATION: process.env.ENABLE_CURATION,
};

beforeAll(() => {
  process.env.AI_PROVIDER = 'mock';
  process.env.MOCK_GENERATION_FAILURE_RATE = '0';
  process.env.MOCK_GENERATION_DELAY_MS = '300';
  process.env.ENABLE_CURATION = 'false';
});

afterAll(() => {
  if (ORIGINAL_ENV.AI_PROVIDER === undefined) {
    delete process.env.AI_PROVIDER;
  } else {
    process.env.AI_PROVIDER = ORIGINAL_ENV.AI_PROVIDER;
  }

  if (ORIGINAL_ENV.MOCK_GENERATION_FAILURE_RATE === undefined) {
    delete process.env.MOCK_GENERATION_FAILURE_RATE;
  } else {
    process.env.MOCK_GENERATION_FAILURE_RATE =
      ORIGINAL_ENV.MOCK_GENERATION_FAILURE_RATE;
  }

  if (ORIGINAL_ENV.MOCK_GENERATION_DELAY_MS === undefined) {
    delete process.env.MOCK_GENERATION_DELAY_MS;
  } else {
    process.env.MOCK_GENERATION_DELAY_MS =
      ORIGINAL_ENV.MOCK_GENERATION_DELAY_MS;
  }

  if (ORIGINAL_ENV.ENABLE_CURATION === undefined) {
    delete process.env.ENABLE_CURATION;
  } else {
    process.env.ENABLE_CURATION = ORIGINAL_ENV.ENABLE_CURATION;
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createPlanRequest(body: unknown) {
  return new Request(BASE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createStatusRequest(planId: string) {
  return new Request(`${BASE_URL}/${planId}/status`, {
    method: 'GET',
    headers: { 'content-type': 'application/json' },
  });
}

interface PlanStatusPayload {
  planId: string;
  status: string;
  attempts: number;
  latestJobId: string | null;
  latestJobStatus: string | null;
  latestJobError: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

async function waitForStatus(
  planId: string,
  predicate: (payload: PlanStatusPayload) => boolean,
  { timeoutMs = 60_000, intervalMs = 100 } = {}
): Promise<PlanStatusPayload> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const statusRequest = createStatusRequest(planId);
    const statusResponse = await GET_STATUS(statusRequest);
    const payload = (await statusResponse.json()) as PlanStatusPayload;

    if (predicate(payload)) {
      return payload;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Timed out waiting for plan ${planId} to reach expected status`
  );
}

describe('Plan generation end-to-end', () => {
  it('creates a plan, processes background job, and exposes ready status (J027)', async () => {
    const clerkUserId = 'e2e-success-user';
    setTestUser(clerkUserId);
    const userId = await ensureUser({
      clerkUserId,
      email: `${clerkUserId}@example.com`,
    });

    const requestPayload = {
      topic: 'Distributed Systems Fundamentals',
      skillLevel: 'intermediate',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      notes: 'Cover consensus and replication patterns.',
    };

    const request = createPlanRequest(requestPayload);
    const response = await POST_PLAN(request);
    expect(response.status).toBe(201);
    const planPayload = await response.json();
    const planId: string = planPayload.id;

    const worker = new PlanGenerationWorker({
      handlers: createDefaultHandlers(),
      pollIntervalMs: 40,
      concurrency: 1,
      closeDbOnStop: false,
    });

    worker.start();

    try {
      const statusPayload = await waitForStatus(
        planId,
        (payload) => payload.status === 'ready'
      );
      expect(statusPayload.status).toBe('ready');
    } finally {
      await worker.stop();
    }

    const jobs = await getJobsByPlanId(planId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe('completed');

    const [planRow] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, planId));
    expect(planRow?.userId).toBe(userId);

    const moduleRows = await db
      .select()
      .from(modules)
      .where(eq(modules.planId, planId));
    expect(moduleRows.length).toBeGreaterThan(0);

    const taskRows = moduleRows.length
      ? await db
          .select()
          .from(tasks)
          .where(
            inArray(
              tasks.moduleId,
              moduleRows.map((module) => module.id)
            )
          )
      : [];
    expect(taskRows.length).toBeGreaterThan(0);

    const planRequest = new Request(`${BASE_URL}/${planId}`);
    const planResponse = await GET_PLAN(planRequest);
    expect(planResponse.status).toBe(200);
    const planDetail = await planResponse.json();
    expect(planDetail.id).toBe(planId);
    expect(planDetail.modules.length).toBeGreaterThan(0);
    const moduleWithTasks = planDetail.modules.filter(
      (module: { tasks: unknown[] }) =>
        Array.isArray(module.tasks) && module.tasks.length > 0
    );
    expect(moduleWithTasks.length).toBeGreaterThan(0);
    expect(planDetail.status).toBe('ready');
  });

  it('records retry attempts then surfaces ready status after recovery (T070 e2e)', async () => {
    const clerkUserId = 'e2e-retry-user';
    setTestUser(clerkUserId);
    const _userId = await ensureUser({
      clerkUserId,
      email: `${clerkUserId}@example.com`,
    });

    const request = createPlanRequest({
      topic: 'Resilient Background Processing',
      skillLevel: 'advanced',
      weeklyHours: 4,
      learningStyle: 'practice',
      visibility: 'private',
      origin: 'ai',
      notes: 'Simulate transient error and recovery.',
    });

    const response = await POST_PLAN(request);
    expect(response.status).toBe(201);
    const { id: planId } = await response.json();

    const failure: ProcessPlanGenerationJobResult = {
      status: 'failure',
      error: 'Transient upstream failure',
      classification: 'provider_error',
      retryable: true,
    };

    const originalProcessPlanGenerationJob =
      workerService.processPlanGenerationJob;
    const processSpy = vi
      .spyOn(workerService, 'processPlanGenerationJob')
      .mockImplementationOnce(async () => failure)
      .mockImplementation((job) => originalProcessPlanGenerationJob(job));

    const worker = new PlanGenerationWorker({
      handlers: createDefaultHandlers(),
      pollIntervalMs: 25,
      concurrency: 1,
      closeDbOnStop: false,
    });

    worker.start();

    try {
      const statusPayload = await waitForStatus(
        planId,
        (payload) => payload.status === 'ready'
      );
      expect(statusPayload.status).toBe('ready');
      expect(statusPayload.latestJobStatus).toBe('completed');
      expect(statusPayload.latestJobError).toBeNull();
    } finally {
      await worker.stop();
    }

    expect(processSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

    const jobRows = await db
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.planId, planId));

    expect(jobRows).toHaveLength(1);
    expect(jobRows[0]?.attempts).toBe(1);
    expect(jobRows[0]?.status).toBe('completed');

    const jobResult = jobRows[0]?.result as PlanGenerationJobResult | null;
    expect(jobResult).not.toBeNull();
    expect(jobResult?.modulesCount ?? 0).toBeGreaterThan(0);
    expect(jobResult?.tasksCount ?? 0).toBeGreaterThan(0);

    const attempts = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, planId));
    expect(attempts.length).toBeGreaterThanOrEqual(1);
    expect(attempts.at(-1)?.status).toBe('success');
  });
});
