import { describe, expect, it, beforeEach, afterAll, vi } from 'vitest';

import { db } from '@/lib/db/service-role';
import { learningPlans } from '@/lib/db/schema';
import type { Job } from '@/lib/jobs/types';
import { JOB_TYPES } from '@/lib/jobs/types';
import { buildUserPrompt, type PromptParams } from '@/lib/ai/prompts';

import {
  ensureUser,
  resetDbForIntegrationTestFile,
} from '../../helpers/db';
import {
  buildTestClerkUserId,
  buildTestEmail,
} from '../../helpers/testIds';

// Capture inputs seen by mocked providers across router chain

(globalThis as any).__capturedInputs = [] as unknown[];

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

// Import after mocks so worker-service uses the mocked providers via the router
import { processPlanGenerationJob } from '@/lib/jobs/worker-service';

// Preserve original env to avoid leakage across suites
const origAiUseMock = process.env.AI_USE_MOCK;
const origAiProvider = process.env.AI_PROVIDER;

describe('Worker-path prompt propagation with dates', () => {
  beforeEach(async () => {
    await resetDbForIntegrationTestFile();
    // Ensure router is used by deleting AI_PROVIDER and setting AI_USE_MOCK
    delete process.env.AI_PROVIDER;
    process.env.AI_USE_MOCK = 'false';
  });

  afterAll(() => {
    // Restore original environment values to maintain test isolation
    if (origAiProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = origAiProvider;

    if (origAiUseMock === undefined) delete process.env.AI_USE_MOCK;
    else process.env.AI_USE_MOCK = origAiUseMock;
  });

  it('passes startDate/deadlineDate through to provider prompt (integration)', async () => {
    const clerkUserId = buildTestClerkUserId('worker-dates-user');
    const userId = await ensureUser({
      clerkUserId,
      email: buildTestEmail(clerkUserId),
    });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Prompt Propagation',
        skillLevel: 'intermediate',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    if (!plan) throw new Error('Failed to insert plan');

    const payload = {
      topic: 'Prompt Propagation',
      notes: 'Ensure dates are included',
      skillLevel: 'intermediate' as const,
      weeklyHours: 5,
      learningStyle: 'mixed' as const,
      startDate: '2025-01-10',
      deadlineDate: '2025-03-01',
    };

    const job: Job = {
      id: 'test-job-1',
      type: JOB_TYPES.PLAN_GENERATION,
      planId: plan.id,
      userId,
      status: 'pending',
      priority: 0,
      attempts: 0,
      maxAttempts: 3,
      data: payload,
      result: null,
      error: null,
      processingStartedAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const outcome = await processPlanGenerationJob(job);
    expect(outcome.status).toBe('success');

    // Read captured input from mocked provider

    const captured = (globalThis as any).__capturedInputs as Array<{
      provider: string;

      input: any;
    }>;
    expect(captured.length).toBeGreaterThan(0);

    // Build the user prompt exactly as providers would
    const params: PromptParams = {
      topic: captured[0].input.topic,
      skillLevel: captured[0].input.skillLevel,
      learningStyle: captured[0].input.learningStyle,
      weeklyHours: captured[0].input.weeklyHours,
      startDate: captured[0].input.startDate,
      deadlineDate: captured[0].input.deadlineDate,
    };

    const prompt = buildUserPrompt(params);
    expect(prompt).toContain('Start date: 2025-01-10');
    expect(prompt).toContain('Deadline: 2025-03-01');
  });
});
