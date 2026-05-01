import { createId } from '@tests/fixtures/ids';
import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { buildTestPlanInsert } from '@tests/fixtures/plans';
import { clearTestUser, setTestUser } from '@tests/helpers/auth';
import { ensureUser } from '@tests/helpers/db';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { GET as GET_ATTEMPTS } from '@/app/api/v1/plans/[planId]/attempts/route';
import { GET as GET_DETAIL } from '@/app/api/v1/plans/[planId]/route';
import { GET as GET_STATUS } from '@/app/api/v1/plans/[planId]/status/route';
import { GET as GET_LIST } from '@/app/api/v1/plans/route';
import {
  generationAttempts,
  learningPlans,
  taskProgress,
} from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { PlanStatusResponseSchema } from '@/shared/schemas/plan-status';

vi.mock('@/lib/auth/server', () => ({
  auth: { getSession: vi.fn() },
}));

/** Locks lightweight list item shape for GET /api/v1/plans (AC3). */
const lightweightPlanListItemSchema = z
  .object({
    id: z.string().uuid(),
    topic: z.string(),
    skillLevel: z.string(),
    learningStyle: z.string(),
    visibility: z.string(),
    origin: z.string(),
    generationStatus: z.string(),
    createdAt: z.string(),
    updatedAt: z.string().nullable(),
    completion: z.number(),
    completedTasks: z.number(),
    totalTasks: z.number(),
    totalMinutes: z.number(),
    completedMinutes: z.number(),
    completedModules: z.number(),
    moduleCount: z.number(),
  })
  .strict();

const clientModuleSchema = z
  .object({
    id: z.string().uuid(),
    order: z.number(),
    title: z.string(),
    description: z.string().nullable(),
    estimatedMinutes: z.number(),
    tasks: z.array(
      z
        .object({
          id: z.string().uuid(),
          order: z.number(),
          title: z.string(),
          description: z.string().nullable(),
          estimatedMinutes: z.number(),
          status: z.string(),
          resources: z.array(z.unknown()),
        })
        .strict(),
    ),
  })
  .strict();

const clientPlanDetailSchema = z
  .object({
    id: z.string().uuid(),
    topic: z.string(),
    skillLevel: z.string(),
    weeklyHours: z.number(),
    learningStyle: z.string(),
    visibility: z.string(),
    origin: z.string(),
    createdAt: z.string().optional(),
    modules: z.array(clientModuleSchema),
    totalTasks: z.number(),
    completedTasks: z.number(),
    totalMinutes: z.number(),
    completedMinutes: z.number(),
    completedModules: z.number(),
    status: z.string().optional(),
    latestAttempt: z.unknown().nullable(),
  })
  .strict();

const generationAttemptSchema = z
  .object({
    id: z.string().uuid(),
    status: z.string(),
    classification: z.string().nullable(),
    durationMs: z.number(),
    modulesCount: z.number(),
    tasksCount: z.number(),
    truncatedTopic: z.boolean(),
    truncatedNotes: z.boolean(),
    normalizedEffort: z.boolean(),
    promptHash: z.string().nullable(),
    metadata: z.unknown().nullable(),
    model: z.string().nullable().optional(),
    createdAt: z.string(),
  })
  .strict();

describe('Plan read API response contracts', () => {
  let authUserId = '';
  let userId = '';

  beforeEach(async () => {
    authUserId = createId('auth-user');
    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: { id: authUserId } },
    });

    setTestUser(authUserId);
    userId = await ensureUser({
      authUserId,
      email: 'plans-read-contract@example.com',
      subscriptionTier: 'pro',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearTestUser();
  });

  async function seedPlanReadContractFixture() {
    const [plan] = await db
      .insert(learningPlans)
      .values(
        buildTestPlanInsert(userId, {
          topic: 'Contract Plan',
          skillLevel: 'beginner',
          weeklyHours: 3,
          learningStyle: 'mixed',
          visibility: 'private',
          origin: 'ai',
          generationStatus: 'ready',
          createdAt: new Date('2026-02-01T10:00:00.000Z'),
          updatedAt: new Date('2026-02-10T10:00:00.000Z'),
        }),
      )
      .returning();

    const mod = await createTestModule({
      planId: plan.id,
      title: 'M1',
      estimatedMinutes: 30,
    });
    const t1 = await createTestTask({
      moduleId: mod.id,
      order: 1,
      title: 'T1',
      estimatedMinutes: 30,
    });

    await db.insert(taskProgress).values({
      taskId: t1.id,
      userId,
      status: 'completed',
      completedAt: new Date('2026-02-11T10:00:00.000Z'),
    });

    const [attempt] = await db
      .insert(generationAttempts)
      .values({
        planId: plan.id,
        status: 'success',
        classification: null,
        durationMs: 1_200,
        modulesCount: 1,
        tasksCount: 1,
        truncatedTopic: false,
        truncatedNotes: false,
        normalizedEffort: false,
        promptHash: createId('hash'),
        metadata: { provider: { model: 'gpt-4.1-mini' } },
      })
      .returning();

    return { plan, attempt };
  }

  it('GET /plans returns lightweight list item shape', async () => {
    const { plan } = await seedPlanReadContractFixture();

    const listRes = await GET_LIST(
      new NextRequest('http://localhost:3000/api/v1/plans?limit=5', {
        method: 'GET',
      }),
    );
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as unknown[];
    const listItem = listBody.find(
      (item): item is unknown =>
        typeof item === 'object' &&
        item !== null &&
        'id' in item &&
        (item as { id?: string }).id === plan.id,
    );

    expect(listItem).toBeDefined();
    lightweightPlanListItemSchema.parse(listItem);
  });

  it('GET /plans/:id returns plan detail shape', async () => {
    const { plan } = await seedPlanReadContractFixture();

    const detailRes = await GET_DETAIL(
      new NextRequest(`http://localhost:3000/api/v1/plans/${plan.id}`, {
        method: 'GET',
      }),
    );
    expect(detailRes.status).toBe(200);
    const detailJson: unknown = await detailRes.json();
    clientPlanDetailSchema.parse(detailJson);
  });

  it('GET /plans/:id/status returns status shape', async () => {
    const { plan } = await seedPlanReadContractFixture();

    const statusRes = await GET_STATUS(
      new NextRequest(`http://localhost:3000/api/v1/plans/${plan.id}/status`, {
        method: 'GET',
      }),
    );
    expect(statusRes.status).toBe(200);
    const statusJson: unknown = await statusRes.json();
    PlanStatusResponseSchema.parse(statusJson);
  });

  it('GET /plans/:id/attempts returns attempt shape', async () => {
    const { plan, attempt } = await seedPlanReadContractFixture();

    const attemptsRes = await GET_ATTEMPTS(
      new NextRequest(
        `http://localhost:3000/api/v1/plans/${plan.id}/attempts`,
        { method: 'GET' },
      ),
    );
    expect(attemptsRes.status).toBe(200);
    const attemptsJson: unknown = await attemptsRes.json();
    expect(Array.isArray(attemptsJson)).toBe(true);
    const attempts = attemptsJson as unknown[];
    const firstAttempt = attempts.find(
      (row): row is unknown =>
        typeof row === 'object' &&
        row !== null &&
        'id' in row &&
        (row as { id?: string }).id === attempt.id,
    );

    expect(firstAttempt).toBeDefined();
    generationAttemptSchema.parse(firstAttempt);
  });
});
