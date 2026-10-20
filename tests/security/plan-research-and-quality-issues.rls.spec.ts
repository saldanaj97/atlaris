import { expectRlsViolation } from './rls-test-helpers';
import { listGenerationQualityIssuesForPlan } from '@/lib/db/queries/generation-quality-issues';
import {
  getLatestPlanResearch,
  insertPlanResearch,
} from '@/lib/db/queries/plan-research';
import {
  generationQualityIssues,
  learningPlans,
  planResearch,
  researchSources,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestPlan } from '@tests/fixtures/plans';
import { truncateAll } from '@tests/helpers/db/truncate';
import { ensureUser } from '@tests/helpers/db/users';
import {
  cleanupTrackedRlsClients,
  createRlsDbForUser,
} from '@tests/helpers/rls';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

async function createOwnerAndOther(suffix: string) {
  const ownerAuthUserId = buildTestAuthUserId(`research-rls-${suffix}`);
  const ownerUserId = await ensureUser({
    authUserId: ownerAuthUserId,
    email: buildTestEmail(ownerAuthUserId),
  });
  const otherAuthUserId = buildTestAuthUserId(`research-rls-other-${suffix}`);
  await ensureUser({
    authUserId: otherAuthUserId,
    email: buildTestEmail(otherAuthUserId),
  });
  const plan = await createTestPlan({ userId: ownerUserId });

  return {
    plan,
    ownerDb: await createRlsDbForUser(ownerAuthUserId),
    otherDb: await createRlsDbForUser(otherAuthUserId),
  };
}

describe('plan research and quality issue RLS', () => {
  beforeEach(async () => {
    await cleanupTrackedRlsClients();
    await truncateAll();
  });

  afterEach(async () => {
    await cleanupTrackedRlsClients();
  });

  it('plan_research and research_sources: owners read, others see nothing, nobody writes', async () => {
    const { plan, ownerDb, otherDb } = await createOwnerAndOther('research');
    const { research, sources } = await insertPlanResearch(
      {
        research: {
          planId: plan.id,
          brief: 'Brief',
          mode: 'fast',
          status: 'ok',
        },
        sources: [
          { citationKey: 'S1', url: 'https://example.com', title: 'One' },
        ],
      },
      db,
    );
    const sourceId = sources[0]?.id;
    if (!sourceId) throw new Error('Expected research source id');

    const ownerView = await getLatestPlanResearch(plan.id, ownerDb);
    expect(ownerView?.research.id).toBe(research.id);
    expect(ownerView?.sources.map((source) => source.id)).toEqual([sourceId]);

    await expect(getLatestPlanResearch(plan.id, otherDb)).resolves.toBeNull();
    await expect(otherDb.select().from(researchSources)).resolves.toEqual([]);

    await expectRlsViolation(() =>
      ownerDb.insert(planResearch).values({
        planId: plan.id,
        brief: 'Forged',
        mode: 'fast',
        status: 'ok',
      }),
    );
    await expectRlsViolation(() =>
      ownerDb
        .update(planResearch)
        .set({ brief: 'Edited' })
        .where(eq(planResearch.id, research.id)),
    );
    await expectRlsViolation(() =>
      ownerDb.delete(planResearch).where(eq(planResearch.id, research.id)),
    );

    await expectRlsViolation(() =>
      ownerDb.insert(researchSources).values({
        researchId: research.id,
        citationKey: 'S2',
        url: 'https://example.com/forged',
        title: 'Forged',
      }),
    );
    await expectRlsViolation(() =>
      ownerDb
        .update(researchSources)
        .set({ title: 'Edited' })
        .where(eq(researchSources.id, sourceId)),
    );
    await expectRlsViolation(() =>
      ownerDb.delete(researchSources).where(eq(researchSources.id, sourceId)),
    );
  });

  it('generation_quality_issues: owners read, others see nothing, nobody writes', async () => {
    const { plan, ownerDb, otherDb } = await createOwnerAndOther('quality');
    const [issue] = await db
      .insert(generationQualityIssues)
      .values({
        planId: plan.id,
        stage: 'outline',
        issueCode: 'module_count_low',
        message: 'Too few modules.',
        pass: 0,
      })
      .returning();
    if (!issue) throw new Error('Expected quality issue');

    const ownerRows = await listGenerationQualityIssuesForPlan(
      plan.id,
      ownerDb,
    );
    expect(ownerRows.map((row) => row.id)).toEqual([issue.id]);
    await expect(
      listGenerationQualityIssuesForPlan(plan.id, otherDb),
    ).resolves.toEqual([]);

    await expectRlsViolation(() =>
      ownerDb.insert(generationQualityIssues).values({
        planId: plan.id,
        stage: 'lesson',
        issueCode: 'forged',
        message: 'Forged.',
        pass: 0,
      }),
    );
    await expectRlsViolation(() =>
      ownerDb
        .update(generationQualityIssues)
        .set({ resolved: true })
        .where(eq(generationQualityIssues.id, issue.id)),
    );
    await expectRlsViolation(() =>
      ownerDb
        .delete(generationQualityIssues)
        .where(eq(generationQualityIssues.id, issue.id)),
    );
  });

  it('learning_plans regeneration fields: owners read them but cannot write them', async () => {
    const { plan, ownerDb, otherDb } = await createOwnerAndOther('plan-fields');
    await db
      .update(learningPlans)
      .set({
        regenerationReasons: ['too_easy'],
        regenerationNote: 'More depth',
      })
      .where(eq(learningPlans.id, plan.id));

    const selectFields = {
      regenerationReasons: learningPlans.regenerationReasons,
      regenerationNote: learningPlans.regenerationNote,
    };
    await expect(
      ownerDb
        .select(selectFields)
        .from(learningPlans)
        .where(eq(learningPlans.id, plan.id)),
    ).resolves.toEqual([
      { regenerationReasons: ['too_easy'], regenerationNote: 'More depth' },
    ]);
    await expect(
      otherDb
        .select(selectFields)
        .from(learningPlans)
        .where(eq(learningPlans.id, plan.id)),
    ).resolves.toEqual([]);

    await expectRlsViolation(() =>
      ownerDb
        .update(learningPlans)
        .set({ regenerationNote: 'Edited by browser' })
        .where(eq(learningPlans.id, plan.id)),
    );
  });
});
