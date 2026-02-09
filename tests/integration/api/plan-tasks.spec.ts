import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { setTestUser, clearTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import { db } from '@/lib/db/service-role';
import { learningPlans, modules, tasks } from '@/lib/db/schema';

// Mock auth before importing the route
vi.mock('@/lib/auth/server', () => ({
  auth: { getSession: vi.fn() },
}));

describe('GET /api/v1/plans/:planId/tasks', () => {
  const ownerAuthId = 'auth_plan_tasks_owner';
  const otherAuthId = 'auth_plan_tasks_other';
  let ownerUserId: string;
  let _otherUserId: string;
  let planId: string;
  let moduleId: string;

  beforeEach(async () => {
    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: { id: ownerAuthId } },
    });

    setTestUser(ownerAuthId);

    ownerUserId = await ensureUser({
      authUserId: ownerAuthId,
      email: 'plan-tasks-owner@example.com',
    });

    _otherUserId = await ensureUser({
      authUserId: otherAuthId,
      email: 'plan-tasks-other@example.com',
    });

    // Create a plan with tasks
    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: ownerUserId,
        topic: 'TypeScript Fundamentals',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();
    planId = plan.id;

    const [module] = await db
      .insert(modules)
      .values({
        planId,
        order: 1,
        title: 'Introduction',
        estimatedMinutes: 120,
      })
      .returning();
    moduleId = module.id;

    await db.insert(tasks).values([
      {
        moduleId,
        order: 1,
        title: 'Learn basics',
        estimatedMinutes: 60,
        hasMicroExplanation: false,
      },
      {
        moduleId,
        order: 2,
        title: 'Practice concepts',
        estimatedMinutes: 60,
        hasMicroExplanation: false,
      },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearTestUser();
  });

  it('should return all tasks for the plan owner', async () => {
    const { GET } = await import('@/app/api/v1/plans/[planId]/tasks/route');
    const request = new NextRequest(
      `http://localhost:3000/api/v1/plans/${planId}/tasks`,
      { method: 'GET' }
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0]).toHaveProperty('title');
    expect(body[0]).toHaveProperty('moduleId', moduleId);
    expect(body[1]).toHaveProperty('title');
  });

  it('should return 404 for non-existent plan', async () => {
    const { GET } = await import('@/app/api/v1/plans/[planId]/tasks/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/plans/00000000-0000-0000-0000-000000000000/tasks',
      { method: 'GET' }
    );

    const response = await GET(request);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  it('should return 401 for unauthenticated requests', async () => {
    clearTestUser();

    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: null },
    });

    const { GET } = await import('@/app/api/v1/plans/[planId]/tasks/route');
    const request = new NextRequest(
      `http://localhost:3000/api/v1/plans/${planId}/tasks`,
      { method: 'GET' }
    );

    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return 401 when session payload is null', async () => {
    clearTestUser();

    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: null,
    });

    const { GET } = await import('@/app/api/v1/plans/[planId]/tasks/route');
    const request = new NextRequest(
      `http://localhost:3000/api/v1/plans/${planId}/tasks`,
      { method: 'GET' }
    );

    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return 404 when accessing another users plan', async () => {
    // Switch to another user
    const { auth } = await import('@/lib/auth/server');
    vi.mocked(auth.getSession).mockResolvedValue({
      data: { user: { id: otherAuthId } },
    });

    setTestUser(otherAuthId);

    const { GET } = await import('@/app/api/v1/plans/[planId]/tasks/route');
    const request = new NextRequest(
      `http://localhost:3000/api/v1/plans/${planId}/tasks`,
      { method: 'GET' }
    );

    const response = await GET(request);

    expect(response.status).toBe(404);
  });

  it('should return empty array for plan with no tasks', async () => {
    // Create a plan without tasks
    const [emptyPlan] = await db
      .insert(learningPlans)
      .values({
        userId: ownerUserId,
        topic: 'Empty Plan',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'manual',
      })
      .returning();

    const { GET } = await import('@/app/api/v1/plans/[planId]/tasks/route');
    const request = new NextRequest(
      `http://localhost:3000/api/v1/plans/${emptyPlan.id}/tasks`,
      { method: 'GET' }
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it('should return tasks ordered by module and task order', async () => {
    // Create a second module with tasks
    const [module2] = await db
      .insert(modules)
      .values({
        planId,
        order: 2,
        title: 'Advanced Topics',
        estimatedMinutes: 180,
      })
      .returning();

    await db.insert(tasks).values([
      {
        moduleId: module2.id,
        order: 1,
        title: 'Advanced task 1',
        estimatedMinutes: 90,
        hasMicroExplanation: false,
      },
      {
        moduleId: module2.id,
        order: 2,
        title: 'Advanced task 2',
        estimatedMinutes: 90,
        hasMicroExplanation: false,
      },
    ]);

    const { GET } = await import('@/app/api/v1/plans/[planId]/tasks/route');
    const request = new NextRequest(
      `http://localhost:3000/api/v1/plans/${planId}/tasks`,
      { method: 'GET' }
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toHaveLength(4);
    // First two tasks from first module
    expect(body[0].title).toBe('Learn basics');
    expect(body[1].title).toBe('Practice concepts');
    // Next two tasks from second module
    expect(body[2].title).toBe('Advanced task 1');
    expect(body[3].title).toBe('Advanced task 2');
  });
});
