/**
 * E2E tests for plan generation with curation
 * Tests: resources attached, explanations appended, cutoff respected, no broken links
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { POST as POST_PLAN } from '@/app/api/v1/plans/route';
import { GET as GET_PLAN } from '@/app/api/v1/plans/[planId]/route';
import { GET as GET_STATUS } from '@/app/api/v1/plans/[planId]/status/route';
import { db } from '@/lib/db/service-role';
import { eq, inArray } from 'drizzle-orm';
import { modules, taskResources, tasks } from '@/lib/db/schema';
import { setTestUser } from '../helpers/auth';
import { ensureUser } from '../helpers/db';

const BASE_URL = 'http://localhost/api/v1/plans';

// Helper to mock Google API rate limiter after vi.resetModules()
// This prevents real API calls when modules are reloaded with different env vars
function mockGoogleApiRateLimiter() {
  vi.doMock('@/lib/utils/google-api-rate-limiter', () => ({
    fetchGoogleApi: vi.fn(async (url: string | URL) => {
      const urlString = url.toString();

      // Mock YouTube search API
      if (urlString.includes('youtube/v3/search')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: { videoId: 'mock-video-1' },
                snippet: {
                  title: 'React Hooks Tutorial',
                  channelTitle: 'React Channel',
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Mock YouTube videos API
      if (urlString.includes('youtube/v3/videos')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'mock-video-1',
                statistics: { viewCount: '10000' },
                snippet: { publishedAt: new Date().toISOString() },
                contentDetails: { duration: 'PT10M' },
                status: { privacyStatus: 'public', embeddable: true },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Mock Google Custom Search API
      if (urlString.includes('customsearch/v1')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                link: 'https://react.dev/docs',
                title: 'React Documentation',
                snippet: 'Learn React',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Default mock response
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
    googleApiRateLimiter: {
      fetch: vi.fn(),
      clearCache: vi.fn(),
      getStatus: vi.fn(() => ({
        queueLength: 0,
        activeRequests: 0,
        cacheSize: 0,
        dailyRequestCount: 0,
        dailyQuotaRemaining: 1000,
        quotaResetsInMinutes: 60,
      })),
    },
  }));
}

const ORIGINAL_ENV = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  ENABLE_CURATION: process.env.ENABLE_CURATION,
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
  MIN_RESOURCE_SCORE: process.env.MIN_RESOURCE_SCORE,
  MOCK_GENERATION_FAILURE_RATE: process.env.MOCK_GENERATION_FAILURE_RATE,
  MOCK_GENERATION_DELAY_MS: process.env.MOCK_GENERATION_DELAY_MS,
};

const originalFetch = global.fetch;

beforeAll(() => {
  process.env.AI_PROVIDER = 'mock';
  process.env.ENABLE_CURATION = 'true';
  process.env.YOUTUBE_API_KEY = 'test-key';
  process.env.MIN_RESOURCE_SCORE = '0.6';
  process.env.MOCK_GENERATION_FAILURE_RATE = '0';
  process.env.MOCK_GENERATION_DELAY_MS = '300';
});

afterAll(() => {
  Object.entries(ORIGINAL_ENV).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
  global.fetch = originalFetch;
});

beforeEach(() => {
  // Mock fetch for YouTube API calls to prevent real API failures
  global.fetch = vi.fn(async (input: any, init?: any) => {
    const method =
      init?.method ?? (input instanceof Request ? input.method : 'GET');
    const url =
      typeof input === 'string' ? input : (input?.url ?? String(input));

    if (
      typeof url === 'string' &&
      url.includes('www.googleapis.com/youtube/v3/search')
    ) {
      const body = {
        items: [
          {
            id: { videoId: 'test-video-1' },
            snippet: {
              title: 'React Hooks Tutorial',
              channelTitle: 'React Channel',
            },
          },
          {
            id: { videoId: 'test-video-2' },
            snippet: {
              title: 'useState and useEffect Guide',
              channelTitle: 'React Channel',
            },
          },
        ],
      };
      return new Response(JSON.stringify(body), { status: 200 });
    }

    if (
      typeof url === 'string' &&
      url.includes('www.googleapis.com/youtube/v3/videos')
    ) {
      const params = new URL(url).searchParams;
      const ids = (params.get('id') ?? '').split(',');
      const body = {
        items: ids.filter(Boolean).map((id) => ({
          id,
          statistics: { viewCount: '10000' },
          snippet: { publishedAt: new Date().toISOString() },
          contentDetails: { duration: 'PT10M' },
          status: { privacyStatus: 'public', embeddable: true },
        })),
      };
      return new Response(JSON.stringify(body), { status: 200 });
    }

    // Mock Google CSE or docs search if needed
    if (
      typeof url === 'string' &&
      url.includes('www.googleapis.com/customsearch/v1')
    ) {
      const body = {
        items: [
          {
            title: 'React Hooks Documentation',
            link: 'https://react.dev/reference/react',
            snippet: 'Official React Hooks documentation',
          },
        ],
      };
      return new Response(JSON.stringify(body), { status: 200 });
    }

    // Default: return 200 OK for HEAD requests (docs validation)
    if (method === 'HEAD') {
      return new Response(null, { status: 200 });
    }

    // Fallback to original fetch for other requests
    return originalFetch(input as RequestInfo, init);
  }) as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
  global.fetch = originalFetch;
});

async function waitForStatus(
  planId: string,
  predicate: (payload: { status: string }) => boolean,
  { timeoutMs = 60_000, intervalMs = 100 } = {}
): Promise<{ status: string }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const statusRequest = new Request(`${BASE_URL}/${planId}/status`, {
      method: 'GET',
    });
    const statusResponse = await GET_STATUS(statusRequest);
    const payload = (await statusResponse.json()) as { status: string };

    if (predicate(payload)) {
      return payload;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Timed out waiting for plan ${planId} to reach expected status`
  );
}

describe('Plan generation with curation E2E', () => {
  it('generates plan with resources, explanations, and cutoff respected (5h/week, 4 weeks)', async () => {
    // Reset modules to ensure curation config is loaded with env vars from beforeAll
    vi.resetModules();
    mockGoogleApiRateLimiter();

    const clerkUserId = 'e2e-curation-user';
    setTestUser(clerkUserId);
    await ensureUser({
      clerkUserId,
      email: `${clerkUserId}@example.com`,
    });

    const requestPayload = {
      topic: 'React Hooks',
      skillLevel: 'intermediate',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      notes: 'Focus on useState and useEffect.',
    };

    const request = new Request(BASE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestPayload),
    });

    const response = await POST_PLAN(request);
    expect(response.status).toBe(201);
    const planPayload = await response.json();
    const planId: string = planPayload.id;

    // Import worker and helpers after env is set so curationConfig picks up keys
    const { PlanGenerationWorker } = await import('@/workers/plan-generator');
    const { createDefaultHandlers } = await import('../helpers/workerHelpers');
    const worker = new PlanGenerationWorker({
      handlers: createDefaultHandlers(),
      pollIntervalMs: 50,
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

    // Fetch plan details
    const planRequest = new Request(`${BASE_URL}/${planId}`);
    const planResponse = await GET_PLAN(planRequest);
    expect(planResponse.status).toBe(200);
    const planDetail = await planResponse.json();

    // Verify plan has modules and tasks
    expect(planDetail.modules.length).toBeGreaterThan(0);
    const totalTasks = planDetail.modules.reduce(
      (sum: number, module: { tasks: unknown[] }) =>
        sum + (Array.isArray(module.tasks) ? module.tasks.length : 0),
      0
    );
    expect(totalTasks).toBeGreaterThan(0);

    // Check that resources were attached at the plan level via API response
    const allTasks = planDetail.modules.flatMap(
      (m: { tasks: Array<{ resources?: unknown[] }> }) => m.tasks
    );
    const totalAttachedResourcesFromClient = allTasks.reduce(
      (sum: number, t: { resources?: unknown[] }) =>
        sum + (t.resources?.length ?? 0),
      0
    );
    expect(totalAttachedResourcesFromClient).toBeGreaterThan(0);

    // With the default cutoff, ensure each task has at least one resource (when available)
    for (const task of allTasks as Array<{ resources: unknown[] }>) {
      expect((task.resources ?? []).length).toBeGreaterThan(0);
    }

    // Verify url/title/type are present for each resource in client payload
    for (const module of planDetail.modules) {
      for (const task of module.tasks) {
        for (const resource of task.resources) {
          expect(resource.url).toBeTruthy();
          expect(resource.title).toBeTruthy();
          expect(resource.type).toBeTruthy();
        }
      }
    }

    // Verify micro-explanations were appended to task descriptions using client payload
    const tasksWithDescriptions = allTasks.filter(
      (task: { description?: string | null }) =>
        !!task.description && task.description.length > 0
    );
    expect(tasksWithDescriptions.length).toBeGreaterThan(0);
    // Micro-explanations should contain markdown formatting or key terms
    const taskWithDescription = tasksWithDescriptions[0] as {
      description: string;
    };
    expect(taskWithDescription.description).toMatch(
      /explanation|practice|key|use/i
    );

    // Verify scoped plan respects capacity (5h/week * 4 weeks ≈ 26 tasks)
    // With pacing, we expect reasonable task count
    expect(totalTasks).toBeLessThanOrEqual(30); // Slightly above capacity
  }, 60_000);

  it.skip('respects minimum resource score cutoff', async () => {
    const clerkUserId = 'e2e-cutoff-user';
    setTestUser(clerkUserId);
    await ensureUser({
      clerkUserId,
      email: `${clerkUserId}@example.com`,
    });

    const requestPayload = {
      topic: 'Testing with High Cutoff',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'reading',
      visibility: 'private',
      origin: 'ai',
    };

    // Save original value
    const originalMinScore = process.env.MIN_RESOURCE_SCORE;

    try {
      // Set very high min score to filter out most resources
      process.env.MIN_RESOURCE_SCORE = '0.95';

      // Reset modules again to reload config with new env var value
      vi.resetModules();
      mockGoogleApiRateLimiter();

      // Dynamically re-import worker and related modules to pick up new config
      const { PlanGenerationWorker: FreshWorker } = await import(
        '@/workers/plan-generator'
      );
      const { createDefaultHandlers: freshHandlers } = await import(
        '../helpers/workerHelpers'
      );

      const request = new Request(BASE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      const response = await POST_PLAN(request);
      expect(response.status).toBe(201);
      const planPayload = await response.json();
      const planId: string = planPayload.id;

      const worker = new FreshWorker({
        handlers: freshHandlers(),
        pollIntervalMs: 50,
        concurrency: 1,
        closeDbOnStop: false,
      });

      worker.start();

      try {
        // Increase timeout for this test since it may take longer with high cutoff
        const statusPayload = await waitForStatus(
          planId,
          (payload) => payload.status === 'ready',
          { timeoutMs: 60_000, intervalMs: 200 }
        );
        expect(statusPayload.status).toBe('ready');
      } finally {
        await worker.stop();
      }

      // Verify plan generated successfully despite high cutoff
      const planRequest = new Request(`${BASE_URL}/${planId}`);
      const planResponse = await GET_PLAN(planRequest);
      expect(planResponse.status).toBe(200);

      // Verify that high cutoff resulted in fewer/no resources attached
      // (resources with score < 0.95 should be filtered out)
      const planDetail = await planResponse.json();
      expect(planDetail.modules.length).toBeGreaterThan(0);

      // Get all module IDs for this plan
      const moduleRows = await db
        .select()
        .from(modules)
        .where(eq(modules.planId, planId));

      const moduleIds = moduleRows.map((m) => m.id);

      // Get all task IDs for the plan's modules
      const taskRows = await db
        .select()
        .from(tasks)
        .where(inArray(tasks.moduleId, moduleIds));

      // Get all taskResources for any task in the plan's modules
      const attachedResources =
        taskRows.length > 0
          ? await db
              .select()
              .from(taskResources)
              .where(
                inArray(
                  taskResources.taskId,
                  taskRows.map((t) => t.id)
                )
              )
          : [];

      // With high cutoff (0.95), resources should be filtered out
      // but plan generation should still succeed
      // This verifies the cutoff is actually being applied at the plan level
      expect(attachedResources).toHaveLength(0);
    } finally {
      // Reset modules first before restoring env to prevent config pollution
      vi.resetModules();
      mockGoogleApiRateLimiter();

      // Restore original env
      if (originalMinScore === undefined) {
        delete process.env.MIN_RESOURCE_SCORE;
      } else {
        process.env.MIN_RESOURCE_SCORE = originalMinScore;
      }
    }
  }, 90_000);
});
