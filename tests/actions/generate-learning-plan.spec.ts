import { generateLearningPlan } from '@/app/plans/actions';
import { db } from '@/lib/db/drizzle';
import { modules, tasks, users } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

async function ensureUser(): Promise<void> {
  const clerkUserId = process.env.DEV_CLERK_USER_ID || `test-${Date.now()}`;
  const email = `${clerkUserId}@example.com`;
  await db
    .insert(users)
    .values({ clerkUserId, email, name: 'Test' })
    .onConflictDoNothing();
}

describe('Server Action: generateLearningPlan', () => {
  beforeEach(() => {
    process.env.AI_PROVIDER = 'mock';
    process.env.AI_USE_MOCK = 'true';
  });

  it('creates a plan, generates modules/tasks, and persists them', async () => {
    await ensureUser();

    const res = await generateLearningPlan({
      topic: 'React',
      skillLevel: 'beginner',
      learningStyle: 'mixed',
      weeklyHours: 4,
      notes: null,
    });

    expect(res.status).toBe('success');
    expect(res.planId).toBeTruthy();

    const moduleRows = await db
      .select()
      .from(modules)
      .where(eq(modules.planId, res.planId));
    expect(moduleRows.length).toBeGreaterThan(0);
    const moduleIds = moduleRows.map((m) => m.id);
    const taskRows = await db
      .select()
      .from(tasks)
      .where(inArray(tasks.moduleId, moduleIds));
    expect(taskRows.length).toBeGreaterThan(0);
  });
});
