/**
 * E2E tests for curation cache behavior
 * Tests: reduced external calls on rerun scenarios
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { POST as POST_PLAN } from '@/app/api/v1/plans/route';
import { GET as GET_STATUS } from '@/app/api/v1/plans/[planId]/status/route';
import { db } from '@/lib/db/drizzle';
import { PlanGenerationWorker } from '@/workers/plan-generator';
import { asc, eq } from 'drizzle-orm';
import { modules, resources, taskResources, tasks } from '@/lib/db/schema';
import { setTestUser } from '../helpers/auth';
import { ensureUser } from '../helpers/db';

const BASE_URL = 'http://localhost/api/v1/plans';

const ORIGINAL_ENV = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  ENABLE_CURATION: process.env.ENABLE_CURATION,
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
  MIN_RESOURCE_SCORE: process.env.MIN_RESOURCE_SCORE,
  MOCK_GENERATION_FAILURE_RATE: process.env.MOCK_GENERATION_FAILURE_RATE,
  MOCK_GENERATION_DELAY_MS: process.env.MOCK_GENERATION_DELAY_MS,
  MOCK_GENERATION_SEED: process.env.MOCK_GENERATION_SEED,
};

beforeAll(() => {
  process.env.AI_PROVIDER = 'mock';
  process.env.ENABLE_CURATION = 'true';
  process.env.YOUTUBE_API_KEY = 'test-key';
  process.env.MIN_RESOURCE_SCORE = '0.6';
  process.env.MOCK_GENERATION_FAILURE_RATE = '0';
  process.env.MOCK_GENERATION_DELAY_MS = '300';
  process.env.MOCK_GENERATION_SEED = '42'; // Deterministic generation
});

afterAll(() => {
  Object.entries(ORIGINAL_ENV).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
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

describe('Plan generation cache behavior E2E', () => {
  it('caches search results and reduces external calls on rerun', async () => {
    const clerkUserId = 'e2e-cache-user';
    setTestUser(clerkUserId);
    await ensureUser({
      clerkUserId,
      email: `${clerkUserId}@example.com`,
    });

    const requestPayload = {
      topic: 'JavaScript Promises',
      skillLevel: 'intermediate',
      weeklyHours: 5,
      learningStyle: 'video',
      visibility: 'private',
      origin: 'ai',
    };

    // Install fetch mock to count upstream calls and provide deterministic responses
    const fetchCounters = {
      youtubeSearch: 0,
      youtubeStats: 0,
      docsSearch: 0,
      docsHead: 0,
    };
    const originalFetch = global.fetch;
    vi.spyOn(global, 'fetch').mockImplementation(
      async (input: any, init?: any) => {
        const method =
          init?.method ?? (input instanceof Request ? input.method : 'GET');
        const url =
          typeof input === 'string' ? input : (input?.url ?? String(input));

        // YouTube Search API
        if (
          typeof url === 'string' &&
          url.includes('www.googleapis.com/youtube/v3/search')
        ) {
          fetchCounters.youtubeSearch += 1;
          // Return stable results regardless of minor query differences to simulate overlap
          const body = {
            items: [
              {
                id: { videoId: 'vid-1' },
                snippet: { title: 'JS Promises Intro', channelTitle: 'Ch1' },
              },
              {
                id: { videoId: 'vid-2' },
                snippet: { title: 'Advanced Promises', channelTitle: 'Ch2' },
              },
            ],
          } as const;
          return new Response(JSON.stringify(body), { status: 200 });
        }

        // YouTube Videos (stats) API (cacheable by joined ids)
        if (
          typeof url === 'string' &&
          url.includes('www.googleapis.com/youtube/v3/videos')
        ) {
          fetchCounters.youtubeStats += 1;
          const params = new URL(url).searchParams;
          const ids = (params.get('id') ?? '').split(',');
          const body = {
            items: ids.filter(Boolean).map((id) => ({
              id,
              statistics: { viewCount: '1000' },
              snippet: { publishedAt: '2024-01-01T00:00:00Z' },
              contentDetails: { duration: 'PT10M' },
              status: { privacyStatus: 'public', embeddable: true },
            })),
          } as const;
          return new Response(JSON.stringify(body), { status: 200 });
        }

        // Google CSE for docs search
        if (
          typeof url === 'string' &&
          url.includes('www.googleapis.com/customsearch/v1')
        ) {
          fetchCounters.docsSearch += 1;
          const body = {
            items: [
              {
                link: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises',
                title: 'Using Promises - MDN',
                snippet: 'Promises in JS',
              },
              {
                link: 'https://nodejs.org/en/learn/asynchronous-work/understanding-javascript-promises',
                title: 'Understanding Promises - Node.js',
                snippet: 'Node.js promises',
              },
            ],
          } as const;
          return new Response(JSON.stringify(body), { status: 200 });
        }

        // HEAD validations for docs (headOk)
        if (method === 'HEAD') {
          fetchCounters.docsHead += 1;
          return new Response(null, { status: 200 });
        }

        // Fallback to original fetch if something unexpected occurs
        return originalFetch(input, init);
      }
    );

    // First generation
    const request1 = new Request(BASE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestPayload),
    });

    const response1 = await POST_PLAN(request1);
    expect(response1.status).toBe(201);
    const planPayload1 = await response1.json();
    const planId1: string = planPayload1.id;

    const worker = new PlanGenerationWorker({
      pollIntervalMs: 50,
      concurrency: 1,
      closeDbOnStop: false,
    });

    worker.start();

    try {
      const statusPayload1 = await waitForStatus(
        planId1,
        (payload) => payload.status === 'ready'
      );
      expect(statusPayload1.status).toBe('ready');
    } finally {
      await worker.stop();
    }

    const firstRunCounters = { ...fetchCounters };

    // Second generation with similar topic
    const requestPayload2 = {
      topic: 'JavaScript Promises Advanced',
      skillLevel: 'intermediate',
      weeklyHours: 5,
      learningStyle: 'video',
      visibility: 'private',
      origin: 'ai',
    };

    const request2 = new Request(BASE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestPayload2),
    });

    const response2 = await POST_PLAN(request2);
    expect(response2.status).toBe(201);
    const planPayload2 = await response2.json();
    const planId2: string = planPayload2.id;

    const worker2 = new PlanGenerationWorker({
      pollIntervalMs: 50,
      concurrency: 1,
      closeDbOnStop: false,
    });

    worker2.start();

    try {
      const statusPayload2 = await waitForStatus(
        planId2,
        (payload) => payload.status === 'ready'
      );
      expect(statusPayload2.status).toBe('ready');
    } finally {
      await worker2.stop();
    }

    // Verify both plans have payloads
    expect(planPayload1).toBeDefined();
    expect(planPayload2).toBeDefined();

    // Assert reduced upstream calls on rerun (cache effectiveness)
    const secondRunCounters = { ...fetchCounters };

    // Compute totals for comparison
    const totalFirst =
      firstRunCounters.youtubeSearch +
      firstRunCounters.youtubeStats +
      firstRunCounters.docsSearch +
      firstRunCounters.docsHead;
    const totalSecond =
      secondRunCounters.youtubeSearch +
      secondRunCounters.youtubeStats +
      secondRunCounters.docsSearch +
      secondRunCounters.docsHead;

    // Total external calls in second run should be strictly less than first run
    expect(totalSecond).toBeLessThanOrEqual(totalFirst);

    // Ensure at least one individual counter decreased to verify cache is working
    expect(
      secondRunCounters.youtubeSearch < firstRunCounters.youtubeSearch ||
        secondRunCounters.youtubeStats < firstRunCounters.youtubeStats ||
        secondRunCounters.docsSearch < firstRunCounters.docsSearch ||
        secondRunCounters.docsHead < firstRunCounters.docsHead,
      'Expected at least one counter to decrease due to caching'
    ).toBe(true);
  }, 60_000);

  it('preserves attachments on cache hits', async () => {
    const clerkUserId = 'e2e-cache-preserve-user';
    setTestUser(clerkUserId);
    await ensureUser({
      clerkUserId,
      email: `${clerkUserId}@example.com`,
    });

    const requestPayload = {
      topic: 'Node.js Fundamentals',
      skillLevel: 'beginner',
      weeklyHours: 4,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
    };

    // Install fetch mock as above but enforce identical query/cache hits
    const fetchCounters = {
      youtubeSearch: 0,
      youtubeStats: 0,
      docsSearch: 0,
      docsHead: 0,
    };
    const originalFetch = global.fetch;
    vi.spyOn(global, 'fetch').mockImplementation(
      async (input: any, init?: any) => {
        const method =
          init?.method ?? (input instanceof Request ? input.method : 'GET');
        const url =
          typeof input === 'string' ? input : (input?.url ?? String(input));
        if (
          typeof url === 'string' &&
          url.includes('www.googleapis.com/youtube/v3/search')
        ) {
          fetchCounters.youtubeSearch += 1;
          const body = {
            items: [
              {
                id: { videoId: 'vid-a' },
                snippet: { title: 'Node.js Basics', channelTitle: 'Node Ch' },
              },
              {
                id: { videoId: 'vid-b' },
                snippet: { title: 'Intro to Node', channelTitle: 'Node Ch 2' },
              },
            ],
          };
          return new Response(JSON.stringify(body), { status: 200 });
        }
        if (
          typeof url === 'string' &&
          url.includes('www.googleapis.com/youtube/v3/videos')
        ) {
          fetchCounters.youtubeStats += 1;
          const params = new URL(url).searchParams;
          const ids = (params.get('id') ?? '').split(',');
          const body = {
            items: ids.filter(Boolean).map((id) => ({
              id,
              statistics: { viewCount: '500' },
              snippet: { publishedAt: '2024-01-01T00:00:00Z' },
              contentDetails: { duration: 'PT8M' },
              status: { privacyStatus: 'public', embeddable: true },
            })),
          } as const;
          return new Response(JSON.stringify(body), { status: 200 });
        }
        if (
          typeof url === 'string' &&
          url.includes('www.googleapis.com/customsearch/v1')
        ) {
          fetchCounters.docsSearch += 1;
          const body = {
            items: [
              {
                link: 'https://nodejs.org/en/learn/getting-started/introduction-to-nodejs',
                title: 'Introduction to Node.js',
                snippet: 'Intro',
              },
              {
                link: 'https://developer.mozilla.org/en-US/docs/Learn/Server-side/Express_Nodejs',
                title: 'Express/Node JS',
                snippet: 'MDN',
              },
            ],
          } as const;
          return new Response(JSON.stringify(body), { status: 200 });
        }
        if (method === 'HEAD') {
          fetchCounters.docsHead += 1;
          return new Response(null, { status: 200 });
        }
        return originalFetch(input, init);
      }
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

    const worker = new PlanGenerationWorker({
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

    // Helper to fetch attachments grouped by task title for a plan
    async function getPlanTaskAttachments(
      planId: string
    ): Promise<
      Map<string, Array<{ url: string; title: string; order: number }>>
    > {
      const rows = await db
        .select({
          taskTitle: tasks.title,
          resourceUrl: resources.url,
          resourceTitle: resources.title,
          taskOrder: tasks.order,
          attachOrder: taskResources.order,
        })
        .from(taskResources)
        .innerJoin(resources, eq(taskResources.resourceId, resources.id))
        .innerJoin(tasks, eq(taskResources.taskId, tasks.id))
        .innerJoin(modules, eq(tasks.moduleId, modules.id))
        .where(eq(modules.planId, planId))
        .orderBy(asc(tasks.order), asc(taskResources.order));

      const map = new Map<
        string,
        Array<{ url: string; title: string; order: number }>
      >();
      for (const row of rows) {
        const list = map.get(row.taskTitle) ?? [];
        list.push({
          url: row.resourceUrl,
          title: row.resourceTitle,
          order: row.attachOrder,
        });
        map.set(row.taskTitle, list);
      }
      return map;
    }

    const firstAttachments = await getPlanTaskAttachments(planId);

    // Capture counter values after first run, before second run
    const countersBeforeSecondRun = {
      youtubeSearch: fetchCounters.youtubeSearch,
      youtubeStats: fetchCounters.youtubeStats,
      docsSearch: fetchCounters.docsSearch,
      docsHead: fetchCounters.docsHead,
    };

    // Trigger a second identical plan generation to ensure cache hit
    const request2 = new Request(BASE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestPayload),
    });

    const response2 = await POST_PLAN(request2);
    expect(response2.status).toBe(201);
    const planPayload2 = await response2.json();
    const planId2: string = planPayload2.id;

    const worker2 = new PlanGenerationWorker({
      pollIntervalMs: 50,
      concurrency: 1,
      closeDbOnStop: false,
    });

    worker2.start();

    try {
      const statusPayload2 = await waitForStatus(
        planId2,
        (payload) => payload.status === 'ready'
      );
      expect(statusPayload2.status).toBe('ready');
    } finally {
      await worker2.stop();
    }

    const secondAttachments = await getPlanTaskAttachments(planId2);

    // Validate same task titles present
    expect(Array.from(secondAttachments.keys()).sort()).toEqual(
      Array.from(firstAttachments.keys()).sort()
    );

    // Validate identical attachment counts and ordered contents per task title
    for (const [taskTitle, firstList] of firstAttachments.entries()) {
      const secondList = secondAttachments.get(taskTitle);
      expect(
        secondList,
        `missing attachments for task ${taskTitle}`
      ).toBeDefined();
      expect(secondList!.length).toBe(firstList.length);
      for (let i = 0; i < firstList.length; i++) {
        expect({
          url: secondList![i].url,
          title: secondList![i].title,
        }).toEqual({ url: firstList[i].url, title: firstList[i].title });
      }
    }

    // Calculate deltas: counters after second run - counters before second run
    const deltas = {
      youtubeSearch:
        fetchCounters.youtubeSearch - countersBeforeSecondRun.youtubeSearch,
      youtubeStats:
        fetchCounters.youtubeStats - countersBeforeSecondRun.youtubeStats,
      docsSearch: fetchCounters.docsSearch - countersBeforeSecondRun.docsSearch,
      docsHead: fetchCounters.docsHead - countersBeforeSecondRun.docsHead,
    };

    // Assert second run made zero new upstream calls due to cache hits
    expect(
      deltas.youtubeSearch,
      'Expected no YouTube search API calls in second run (cache hit)'
    ).toBe(0);
    expect(
      deltas.youtubeStats,
      'Expected no YouTube stats API calls in second run (cache hit)'
    ).toBe(0);
    expect(
      deltas.docsSearch,
      'Expected no docs search API calls in second run (cache hit)'
    ).toBe(0);
    expect(
      deltas.docsHead,
      'Expected no docs HEAD API calls in second run (cache hit)'
    ).toBe(0);
  }, 120_000);
});
