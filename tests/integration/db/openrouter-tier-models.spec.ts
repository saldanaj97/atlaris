import { MODEL_CATALOG_FIXTURE } from '../../fixtures/ai-model-catalog';
import {
  getCatalogModel,
  getTierModels,
  resetModelCatalogStateForTests,
  syncTierModelCatalog,
} from '@/features/ai/model-catalog/catalog';
import { logger } from '@/lib/logging/logger';
import { openRouterTierModels } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { eq, sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SEED_MIGRATION_SQL = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261023210000_seed_openrouter_tier_models.sql',
  ),
  'utf8',
);

const GUARDRAIL_BODY = {
  data: [
    {
      id: 'openai/gpt-5.2',
      name: 'OpenAI: GPT-5.2',
      description: 'Added to the guardrail.',
      context_length: 400_000,
      pricing: { prompt: '0.00000125', completion: '0.00001' },
      top_provider: { max_completion_tokens: 128_000 },
      supported_parameters: ['max_tokens', 'response_format'],
    },
  ],
};

function respondWith(body: unknown, status = 200): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

async function tierModelIds(tier: 'free' | 'starter' | 'pro') {
  const rows = await db
    .select({ modelId: openRouterTierModels.modelId })
    .from(openRouterTierModels)
    .where(eq(openRouterTierModels.tier, tier));
  return rows.map((row) => row.modelId).sort();
}

const fixtureIds = (tier: keyof typeof MODEL_CATALOG_FIXTURE) =>
  MODEL_CATALOG_FIXTURE[tier].map((model) => model.modelId).sort();

describe('openrouter_tier_models sync', () => {
  beforeEach(() => {
    resetModelCatalogStateForTests();
    vi.stubEnv('OPENROUTER_API_KEY_STARTER', 'starter-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('replaces only the synced tier rows', async () => {
    const result = await syncTierModelCatalog(
      'starter',
      respondWith(GUARDRAIL_BODY),
    );

    expect(result.status).toBe('synced');
    expect(await tierModelIds('starter')).toEqual(['openai/gpt-5.2']);
    expect(await tierModelIds('pro')).toEqual(fixtureIds('pro'));
    expect(await getCatalogModel('openai/gpt-5.2')).toMatchObject({
      name: 'GPT-5.2',
      provider: 'OpenAI',
      contextWindow: 400_000,
      maxOutputTokens: 128_000,
      inputCostPerMillion: 1.25,
      outputCostPerMillion: 10,
    });
  });

  it.each([
    ['an empty list', respondWith({ data: [] })],
    ['an HTTP error', respondWith({ error: 'unauthorized' }, 401)],
  ])('keeps the last good rows on %s', async (_label, fetchImpl) => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    const result = await syncTierModelCatalog('starter', fetchImpl);

    expect(result.status).toBe('failed');
    expect(await tierModelIds('starter')).toEqual(fixtureIds('starter'));
  });

  it('reads a tier list cheapest first with synced pricing', async () => {
    const models = await getTierModels('starter');

    expect(models.map((model) => model.id).sort()).toEqual(
      fixtureIds('starter'),
    );
    expect(models[0]?.inputCostPerMillion).toBe(0.07);
    expect(models.at(-1)?.id).toBe('openai/gpt-6.1-sol');
  });

  it('seeds only tiers with no rows', async () => {
    await db
      .delete(openRouterTierModels)
      .where(eq(openRouterTierModels.tier, 'starter'));

    await db.execute(sql.raw(SEED_MIGRATION_SQL));

    const starterRows = await db
      .select({
        modelId: openRouterTierModels.modelId,
        syncedAt: openRouterTierModels.syncedAt,
      })
      .from(openRouterTierModels)
      .where(eq(openRouterTierModels.tier, 'starter'));
    expect(starterRows.map((row) => row.modelId).sort()).toEqual([
      'anthropic/claude-haiku-5.5',
      'deepseek/deepseek-v4.1-flash',
      'openai/gpt-6-luna',
      'openai/gpt-6.1-sol',
    ]);
    expect(starterRows.every((row) => row.syncedAt.getTime() === 0)).toBe(true);
    expect(await tierModelIds('pro')).toEqual(fixtureIds('pro'));
  });
});
