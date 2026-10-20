import {
  getLatestPlanResearch,
  insertPlanResearch,
} from '@/lib/db/queries/plan-research';
import { learningPlans, planResearch, researchSources } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestPlan } from '@tests/fixtures/plans';
import { truncateAll } from '@tests/helpers/db/truncate';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

async function createPlanFixture(suffix: string) {
  const authUserId = buildTestAuthUserId(`research-${suffix}`);
  const userId = await ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
  });
  return createTestPlan({ userId, topic: 'Research Plan' });
}

describe('plan research queries', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('stores a research run with its sources and reads it back', async () => {
    const plan = await createPlanFixture('insert-read');

    const inserted = await insertPlanResearch(
      {
        research: {
          planId: plan.id,
          brief: 'Key concepts and current best practices',
          mode: 'advanced',
          status: 'ok',
          searchCount: 3,
          costMicrousd: 12_500,
        },
        sources: [
          {
            citationKey: 'S10',
            url: 'https://example.com/ten',
            title: 'Tenth source',
            publisher: null,
          },
          {
            citationKey: 'S2',
            url: 'https://example.com/two',
            title: 'Second source',
            publisher: 'Example Docs',
          },
          {
            citationKey: 'S1',
            url: 'https://example.com/one',
            title: 'First source',
            publisher: 'Example Docs',
          },
        ],
      },
      db,
    );

    expect(inserted.research).toMatchObject({
      planId: plan.id,
      mode: 'advanced',
      status: 'ok',
      searchCount: 3,
      costMicrousd: 12_500,
    });
    expect(inserted.sources.map((source) => source.citationKey)).toEqual([
      'S1',
      'S2',
      'S10',
    ]);

    const latest = await getLatestPlanResearch(plan.id, db);
    expect(latest?.research.id).toBe(inserted.research.id);
    expect(latest?.research.createdAt).toBeInstanceOf(Date);
    expect(latest?.sources.map((source) => source.citationKey)).toEqual([
      'S1',
      'S2',
      'S10',
    ]);
    expect(latest?.sources[0]).toMatchObject({
      researchId: inserted.research.id,
      url: 'https://example.com/one',
      title: 'First source',
      publisher: 'Example Docs',
    });
    expect(latest?.sources[0]?.retrievedAt).toBeInstanceOf(Date);
  });

  it('returns null when the plan has no research', async () => {
    const plan = await createPlanFixture('none');

    await expect(getLatestPlanResearch(plan.id, db)).resolves.toBeNull();
  });

  it('treats the most recent run as current after a regeneration adds one', async () => {
    const plan = await createPlanFixture('latest');

    await db.insert(planResearch).values({
      planId: plan.id,
      brief: 'First run',
      mode: 'fast',
      status: 'ok',
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
    });
    const [latestRow] = await db
      .insert(planResearch)
      .values({
        planId: plan.id,
        brief: 'Regeneration run',
        mode: 'fast',
        status: 'failed_skipped',
        createdAt: new Date('2026-10-02T00:00:00.000Z'),
      })
      .returning();

    const latest = await getLatestPlanResearch(plan.id, db);

    expect(latest?.research.id).toBe(latestRow?.id);
    expect(latest?.research).toMatchObject({
      brief: 'Regeneration run',
      status: 'failed_skipped',
      searchCount: 0,
      costMicrousd: null,
    });
    expect(latest?.sources).toEqual([]);

    const allRuns = await db
      .select()
      .from(planResearch)
      .where(eq(planResearch.planId, plan.id));
    expect(allRuns).toHaveLength(2);
  });

  it('rejects invalid citation keys, duplicate keys, and negative counts', async () => {
    const plan = await createPlanFixture('constraints');
    const { research } = await insertPlanResearch(
      {
        research: {
          planId: plan.id,
          brief: 'Constraints',
          mode: 'fast',
          status: 'ok',
        },
        sources: [
          { citationKey: 'S1', url: 'https://example.com', title: 'One' },
        ],
      },
      db,
    );

    for (const citationKey of ['S0', 'S01', 's1', '1', 'S']) {
      await expect(
        db.insert(researchSources).values({
          researchId: research.id,
          citationKey,
          url: 'https://example.com/bad',
          title: 'Bad key',
        }),
      ).rejects.toMatchObject({
        cause: { constraint_name: 'research_sources_citation_key_format' },
      });
    }

    await expect(
      db.insert(researchSources).values({
        researchId: research.id,
        citationKey: 'S1',
        url: 'https://example.com/duplicate',
        title: 'Duplicate key',
      }),
    ).rejects.toMatchObject({
      cause: {
        constraint_name: 'research_sources_research_id_citation_key_unique',
      },
    });

    await expect(
      db.insert(planResearch).values({
        planId: plan.id,
        brief: 'Negative',
        mode: 'fast',
        status: 'ok',
        searchCount: -1,
      }),
    ).rejects.toMatchObject({
      cause: { constraint_name: 'plan_research_search_count_nonneg' },
    });
    await expect(
      db.insert(planResearch).values({
        planId: plan.id,
        brief: 'Negative cost',
        mode: 'fast',
        status: 'ok',
        costMicrousd: -1,
      }),
    ).rejects.toMatchObject({
      cause: { constraint_name: 'plan_research_cost_microusd_nonneg' },
    });
  });

  it('deletes research and sources with the plan', async () => {
    const plan = await createPlanFixture('cascade');
    const { research } = await insertPlanResearch(
      {
        research: {
          planId: plan.id,
          brief: 'Cascade',
          mode: 'fast',
          status: 'ok',
        },
        sources: [
          { citationKey: 'S1', url: 'https://example.com', title: 'One' },
        ],
      },
      db,
    );

    await db.delete(learningPlans).where(eq(learningPlans.id, plan.id));

    const runs = await db
      .select()
      .from(planResearch)
      .where(eq(planResearch.id, research.id));
    const sources = await db
      .select()
      .from(researchSources)
      .where(eq(researchSources.researchId, research.id));
    expect(runs).toHaveLength(0);
    expect(sources).toHaveLength(0);
  });
});
