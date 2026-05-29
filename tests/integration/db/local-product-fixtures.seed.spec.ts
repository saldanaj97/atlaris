import {
  generationAttempts,
  learningPlans,
  modules,
  tasks,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import {
  LOCAL_PRODUCT_BROWSER_FIXTURE_MODULE_ONE_ID,
  LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_ID,
  LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_TOPIC,
  seedLocalProductBrowserFixtures,
} from '@tests/helpers/db/seed-local-product-fixtures';
import { seedLocalProductTestingUser } from '@tests/helpers/db/seed-local-product-testing';
import { asc, eq, inArray } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

const FIXTURE_MODULE_TWO_ID = '44444444-4444-4444-8444-444444444444';
const FIXTURE_TASK_IDS = [
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
  '88888888-8888-4888-8888-888888888888',
] as const;

const FIXTURE_TOPIC = LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_TOPIC;

describe('seedLocalProductBrowserFixtures', () => {
  const connectionUrl = process.env.POSTGRES_URL;

  if (!connectionUrl) {
    throw new Error(
      'POSTGRES_URL is required for fixture seed integration tests.',
    );
  }

  async function readFixtureSnapshot() {
    const [plan] = await db
      .select({
        id: learningPlans.id,
        topic: learningPlans.topic,
        generationStatus: learningPlans.generationStatus,
        userId: learningPlans.userId,
      })
      .from(learningPlans)
      .where(eq(learningPlans.id, LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_ID));

    const moduleRows = await db
      .select({
        id: modules.id,
        order: modules.order,
        title: modules.title,
        lessonGenerationStatus: modules.lessonGenerationStatus,
      })
      .from(modules)
      .where(eq(modules.planId, LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_ID))
      .orderBy(asc(modules.order));

    const moduleIds = moduleRows.map((row) => row.id);
    const taskRows =
      moduleIds.length === 0
        ? []
        : await db
            .select({
              id: tasks.id,
              moduleId: tasks.moduleId,
              order: tasks.order,
              title: tasks.title,
              hasMicroExplanation: tasks.hasMicroExplanation,
            })
            .from(tasks)
            .where(inArray(tasks.moduleId, moduleIds))
            .orderBy(asc(tasks.moduleId), asc(tasks.order));

    const attemptRows = await db
      .select({
        status: generationAttempts.status,
        modulesCount: generationAttempts.modulesCount,
        tasksCount: generationAttempts.tasksCount,
        promptHash: generationAttempts.promptHash,
      })
      .from(generationAttempts)
      .where(
        eq(generationAttempts.planId, LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_ID),
      );

    return { plan, moduleRows, taskRows, attemptRows };
  }

  it('seeds deterministic fixture ids and stable content across re-seed', async () => {
    await seedLocalProductTestingUser(connectionUrl);
    await seedLocalProductBrowserFixtures(connectionUrl);

    const first = await readFixtureSnapshot();

    expect(first.plan).toMatchObject({
      id: LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_ID,
      topic: FIXTURE_TOPIC,
      generationStatus: 'ready',
    });
    expect(first.moduleRows.map((row) => row.id)).toEqual([
      LOCAL_PRODUCT_BROWSER_FIXTURE_MODULE_ONE_ID,
      FIXTURE_MODULE_TWO_ID,
    ]);
    expect(first.moduleRows.map((row) => row.order)).toEqual([1, 2]);
    expect(
      first.moduleRows.every((row) => row.lessonGenerationStatus === 'ready'),
    ).toBe(true);
    expect(first.taskRows.map((row) => row.id)).toEqual([...FIXTURE_TASK_IDS]);
    expect(first.taskRows.every((row) => row.hasMicroExplanation)).toBe(true);
    expect(first.attemptRows).toEqual([
      expect.objectContaining({
        status: 'success',
        modulesCount: 2,
        tasksCount: 4,
        promptHash: 'local-product-fixture',
      }),
    ]);

    await seedLocalProductBrowserFixtures(connectionUrl);

    const second = await readFixtureSnapshot();

    expect(second.plan).toMatchObject({
      id: LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_ID,
      topic: FIXTURE_TOPIC,
      generationStatus: 'ready',
    });
    expect(second.moduleRows.map((row) => row.id)).toEqual(
      first.moduleRows.map((row) => row.id),
    );
    expect(second.taskRows.map((row) => row.id)).toEqual(
      first.taskRows.map((row) => row.id),
    );
    expect(second.attemptRows).toEqual(first.attemptRows);
  });
});
