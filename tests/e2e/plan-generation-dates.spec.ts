import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Capture inputs seen by mocked providers across router chain

(globalThis as any).__capturedInputs = [] as unknown[];

// Mock providers before importing worker/service modules so the router uses them
vi.mock('@/lib/ai/providers/google', () => {
  class GoogleAiProvider {
    async generate(input: unknown) {
      (globalThis as any).__capturedInputs.push({ provider: 'google', input });
      const data = JSON.stringify({
        modules: [
          {
            title: 'Module 1',
            description: 'Intro',
            estimated_minutes: 60,
            tasks: [
              { title: 'Task 1', description: 'Read', estimated_minutes: 30 },
            ],
          },
        ],
      });
      const stream = {
        async *[Symbol.asyncIterator]() {
          yield data;
        },
      } as AsyncIterable<string>;
      return {
        stream,
        metadata: { provider: 'google', model: 'mocked-google' },
      };
    }
  }
  return { GoogleAiProvider };
});

vi.mock('@/lib/ai/providers/cloudflare', () => {
  class CloudflareAiProvider {
    async generate(input: unknown) {
      (globalThis as any).__capturedInputs.push({
        provider: 'cloudflare',
        input,
      });
      const data = JSON.stringify({
        modules: [
          {
            title: 'Module 1',
            description: 'Intro',
            estimated_minutes: 60,
            tasks: [
              { title: 'Task 1', description: 'Read', estimated_minutes: 30 },
            ],
          },
        ],
      });
      const stream = {
        async *[Symbol.asyncIterator]() {
          yield data;
        },
      } as AsyncIterable<string>;
      return {
        stream,
        metadata: { provider: 'cloudflare', model: 'mocked-cf' },
      };
    }
  }
  return { CloudflareAiProvider };
});

vi.mock('@/lib/ai/providers/openrouter', () => {
  class OpenRouterProvider {
    async generate(input: unknown) {
      (globalThis as any).__capturedInputs.push({
        provider: 'openrouter',
        input,
      });
      const data = JSON.stringify({
        modules: [
          {
            title: 'Module 1',
            description: 'Intro',
            estimated_minutes: 60,
            tasks: [
              { title: 'Task 1', description: 'Read', estimated_minutes: 30 },
            ],
          },
        ],
      });
      const stream = {
        async *[Symbol.asyncIterator]() {
          yield data;
        },
      } as AsyncIterable<string>;
      return {
        stream,
        metadata: { provider: 'openrouter', model: 'mocked-openrouter' },
      };
    }
  }
  return { OpenRouterProvider };
});

import { GET as GET_STATUS } from '@/app/api/v1/plans/[planId]/status/route';
import { POST as POST_PLAN } from '@/app/api/v1/plans/route';
import { buildUserPrompt, type PromptParams } from '@/lib/ai/prompts';
import { PlanGenerationWorker } from '@/workers/plan-generator';
import { setTestUser } from '../helpers/auth';
import { ensureUser } from '../helpers/db';

const BASE_URL = 'http://localhost/api/v1/plans';

const ORIGINAL_ENV = {
  AI_USE_MOCK: process.env.AI_USE_MOCK,
};

beforeAll(() => {
  // Ensure router uses our mocked providers, not MockGenerationProvider
  process.env.AI_USE_MOCK = 'false';
});

afterAll(() => {
  if (ORIGINAL_ENV.AI_USE_MOCK === undefined) {
    delete process.env.AI_USE_MOCK;
  } else {
    process.env.AI_USE_MOCK = ORIGINAL_ENV.AI_USE_MOCK;
  }
});

beforeEach(() => {
  vi.restoreAllMocks();

  (globalThis as any).__capturedInputs = [];
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
  { timeoutMs = 20_000, intervalMs = 100 } = {}
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

describe('E2E: plan generation with dates propagates to provider prompt', () => {
  it('creates a plan with dates and worker sends prompt containing dates', async () => {
    const clerkUserId = 'e2e-dates-user';
    setTestUser(clerkUserId);
    const _userId = await ensureUser({
      clerkUserId,
      email: `${clerkUserId}@example.com`,
    });

    const requestPayload = {
      topic: 'Deadline-Aware Planning',
      skillLevel: 'intermediate',
      weeklyHours: 4,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      notes: 'Include date context in prompt',
      startDate: '2025-01-05',
      deadlineDate: '2025-02-20',
    } as const;

    const request = createPlanRequest(requestPayload);
    const response = await POST_PLAN(request);
    expect(response.status).toBe(201);
    const planPayload = await response.json();
    const planId: string = planPayload.id;

    const worker = new PlanGenerationWorker({
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
    } finally {
      await worker.stop();
    }

    const captured = (globalThis as any).__capturedInputs as Array<{
      provider: string;

      input: any;
    }>;
    expect(captured.length).toBeGreaterThan(0);

    // Build the user prompt exactly as providers do and assert date lines
    const params: PromptParams = {
      topic: captured[0].input.topic,
      skillLevel: captured[0].input.skillLevel,
      learningStyle: captured[0].input.learningStyle,
      weeklyHours: captured[0].input.weeklyHours,
      startDate: captured[0].input.startDate,
      deadlineDate: captured[0].input.deadlineDate,
    };
    const prompt = buildUserPrompt(params);
    expect(prompt).toContain('Start date: 2025-01-05');
    expect(prompt).toContain('Deadline: 2025-02-20');
  });
});
