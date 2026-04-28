/**
 * Test factories for database plan records.
 * Use these instead of direct db.insert calls to centralize schema changes.
 */

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { learningPlans } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import type { ClientPlanDetail } from '@/shared/types/client.types';

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

/** Required fields for learning_plans insert (columns without defaults). */
type RequiredPlanInsertFields = Pick<
  LearningPlanInsert,
  'topic' | 'skillLevel' | 'weeklyHours' | 'learningStyle'
>;

type TestPlanOverrides = Partial<Omit<LearningPlanInsert, 'userId'>>;

function buildTestPlanValues(
  overrides: TestPlanOverrides = {},
): RequiredPlanInsertFields &
  Partial<Omit<LearningPlanInsert, 'userId' | keyof RequiredPlanInsertFields>> {
  return {
    ...DEFAULT_PLAN_INSERT,
    ...overrides,
  };
}

export function buildTestPlanInsert(
  userId: string,
  overrides: TestPlanOverrides = {},
): LearningPlanInsert {
  return {
    userId,
    ...buildTestPlanValues(overrides),
  };
}

/**
 * Single insert path for all plan factories.
 * Callers must merge from DEFAULT_PLAN_INSERT or RETRY_TEST_PLAN_DEFAULTS so required
 * fields are present. Accepts Partial for optional columns (DB defaults apply).
 */
async function insertPlanRow(
  userId: string,
  values: RequiredPlanInsertFields &
    Partial<
      Omit<LearningPlanInsert, 'userId' | keyof RequiredPlanInsertFields>
    >,
): Promise<LearningPlanRow> {
  const insert: LearningPlanInsert = { userId, ...values };
  const [plan] = await db.insert(learningPlans).values(insert).returning();

  if (!plan) {
    throw new Error('Failed to create plan');
  }

  return plan;
}

/**
 * Inserts a learning plan with defaults suitable for regeneration tests.
 * Uses db.insert(learningPlans), spreads overrides, returns the created plan; throws on failure.
 */
export async function createPlan(
  userId: string,
  overrides?: TestPlanOverrides,
): Promise<LearningPlanRow> {
  return insertPlanRow(userId, buildTestPlanValues(overrides));
}

/**
 * Inserts a learning plan with defaults tuned for retry endpoint integration tests.
 * Accepts field overrides so tests can customize status, topic, and related columns.
 */
export async function createPlanForRetryTest(
  userId: string,
  overrides: TestPlanOverrides = {},
): Promise<LearningPlanRow> {
  return createPlan(userId, { ...RETRY_TEST_PLAN_DEFAULTS, ...overrides });
}

type CreateTestPlanParams = {
  userId: string;
} & TestPlanOverrides;

/**
 * Inserts a learning plan into the database. Returns the inserted plan.
 * Centralizes plan creation so schema changes are reflected in one place.
 */
export async function createTestPlan(
  params: CreateTestPlanParams,
): Promise<LearningPlanRow> {
  const { userId, ...overrides } = params;

  return createPlan(userId, {
    topic: 'Test Plan',
    weeklyHours: 6,
    learningStyle: 'mixed',
    ...overrides,
  });
}

export function createTestPlanDetail(
  overrides: Partial<ClientPlanDetail> = {},
): ClientPlanDetail {
  const moduleId = nanoid();
  const taskOneId = nanoid();
  const taskTwoId = nanoid();

  return {
    id: nanoid(),
    topic: 'TypeScript',
    skillLevel: 'beginner',
    weeklyHours: 5,
    learningStyle: 'mixed',
    visibility: 'private',
    origin: 'ai',
    createdAt: '2025-01-01T00:00:00.000Z',
    totalTasks: 2,
    completedTasks: 1,
    totalMinutes: 90,
    completedMinutes: 45,
    completedModules: 0,
    status: 'ready',
    latestAttempt: null,
    modules: [
      {
        id: moduleId,
        order: 1,
        title: 'Basics',
        description: null,
        estimatedMinutes: 90,
        tasks: [
          {
            id: taskOneId,
            order: 1,
            title: 'Intro',
            description: null,
            estimatedMinutes: 45,
            status: 'completed',
            resources: [],
          },
          {
            id: taskTwoId,
            order: 2,
            title: 'Practice',
            description: null,
            estimatedMinutes: 45,
            status: 'not_started',
            resources: [],
          },
        ],
      },
    ],
    ...overrides,
  };
}
