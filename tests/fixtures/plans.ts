/**
 * Test factories for database plan records.
 * Use these instead of direct db.insert calls to centralize schema changes.
 */

import type { InferSelectModel } from 'drizzle-orm';

import { learningPlans } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

type LearningPlanRow = InferSelectModel<typeof learningPlans>;

export type CreateTestPlanParams = {
  userId: string;
  topic?: string;
  skillLevel?: 'beginner' | 'intermediate' | 'advanced';
  weeklyHours?: number;
  learningStyle?: 'reading' | 'video' | 'practice' | 'mixed';
  visibility?: string;
  origin?: 'ai' | 'template' | 'manual' | 'pdf';
};

/**
 * Inserts a learning plan into the database. Returns the inserted plan.
 * Centralizes plan creation so schema changes are reflected in one place.
 */
export async function createTestPlan(
  params: CreateTestPlanParams
): Promise<LearningPlanRow> {
  const {
    userId,
    topic = 'Test Plan',
    skillLevel = 'intermediate',
    weeklyHours = 6,
    learningStyle = 'mixed',
    visibility = 'private',
    origin = 'ai',
  } = params;

  const [plan] = await db
    .insert(learningPlans)
    .values({
      userId,
      topic,
      skillLevel,
      weeklyHours,
      learningStyle,
      visibility,
      origin,
    })
    .returning();

  if (!plan) {
    throw new Error('Failed to create test plan');
  }

  return plan;
}
