/**
 * Test factories for database plan records.
 * Use these instead of direct db.insert calls to centralize schema changes.
 */

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import { learningPlans } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

type LearningPlanRow = InferSelectModel<typeof learningPlans>;
type LearningPlanInsert = InferInsertModel<typeof learningPlans>;

const DEFAULT_PLAN_INSERT = {
  topic: 'machine learning',
  skillLevel: 'intermediate' as const,
  weeklyHours: 5,
  learningStyle: 'practice' as const,
  visibility: 'private' as const,
  origin: 'ai' as const,
  generationStatus: 'ready' as const,
  isQuotaEligible: true,
};

const RETRY_TEST_PLAN_DEFAULTS: Pick<
  LearningPlanInsert,
  | 'topic'
  | 'skillLevel'
  | 'weeklyHours'
  | 'learningStyle'
  | 'visibility'
  | 'origin'
  | 'generationStatus'
  | 'isQuotaEligible'
> = {
  topic: 'Retry me',
  skillLevel: 'beginner',
  weeklyHours: 4,
  learningStyle: 'mixed',
  visibility: 'private',
  origin: 'ai',
  generationStatus: 'failed',
  isQuotaEligible: true,
};

/**
 * Inserts a learning plan with defaults suitable for regeneration tests.
 * Uses db.insert(learningPlans), spreads overrides, returns the created plan; throws on failure.
 */
export async function createPlan(
  userId: string,
  overrides?: Partial<typeof learningPlans.$inferInsert>
): Promise<LearningPlanRow> {
  const [plan] = await db
    .insert(learningPlans)
    .values({
      userId,
      ...DEFAULT_PLAN_INSERT,
      ...overrides,
    })
    .returning();

  if (!plan) {
    throw new Error('Failed to create plan');
  }

  return plan;
}

/**
 * Inserts a learning plan with defaults tuned for retry endpoint integration tests.
 * Accepts field overrides so tests can customize status, topic, and related columns.
 */
export async function createPlanForRetryTest(
  userId: string,
  overrides: Partial<LearningPlanInsert> = {}
): Promise<LearningPlanRow> {
  const [plan] = await db
    .insert(learningPlans)
    .values({
      userId,
      ...RETRY_TEST_PLAN_DEFAULTS,
      ...overrides,
    })
    .returning();

  if (!plan) {
    throw new Error('Failed to create retry test plan');
  }

  return plan;
}

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
