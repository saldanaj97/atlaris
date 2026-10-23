import {
  inMemoryModelCatalogStore,
  MODEL_CATALOG_FIXTURE,
  modelCatalogFixtureRows,
  seedModelCatalogFixture,
} from '../../../fixtures/ai-model-catalog';
import {
  getCatalogModel,
  getMemoizedCatalogModel,
  getTierModels,
  MODEL_CATALOG_RETRY_MS,
  MODEL_CATALOG_TTL_MS,
  resetModelCatalogStateForTests,
  syncTierModelCatalog,
} from '@/features/ai/model-catalog/catalog';
import {
  replaceTierModels,
  selectCatalogModel,
  selectTierModels,
} from '@/features/ai/model-catalog/store';
import { logger } from '@/lib/logging/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NEW_MODEL = {
  id: 'openai/gpt-5.2',
  name: 'OpenAI: GPT-5.2',
  description: 'Added to the guardrail.',
  context_length: 400_000,
  pricing: { prompt: '0.00000125', completion: '0.00001' },
  top_provider: { max_completion_tokens: 128_000 },
  supported_parameters: ['max_tokens'],
};

function respondWith(body: unknown, status = 200): typeof fetch {
  return vi.fn(
    async () =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
      }),
  );
}

const starterIds = () =>
  modelCatalogFixtureRows('starter').map((row) => row.modelId);

beforeEach(() => {
  resetModelCatalogStateForTests();
  vi.mocked(replaceTierModels).mockClear();
  vi.stubEnv('OPENROUTER_API_KEY_STARTER', 'starter-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('syncTierModelCatalog', () => {
  it('replaces the tier rows with the guardrail list and logs it', async () => {
    const infoSpy = vi.spyOn(logger, 'info');

    const result = await syncTierModelCatalog(
      'starter',
      respondWith({ data: [NEW_MODEL] }),
    );

    expect(result.status).toBe('synced');
    expect(starterIds()).toEqual(['openai/gpt-5.2']);
    expect(modelCatalogFixtureRows('pro')).toHaveLength(
      MODEL_CATALOG_FIXTURE.pro.length,
    );
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'model_catalog_synced',
        tier: 'starter',
        modelCount: 1,
      }),
      expect.any(String),
    );
  });

  it.each([
    ['an HTTP error', respondWith({ error: 'unauthorized' }, 401)],
    ['an empty list', respondWith({ data: [] })],
    ['an unparseable body', respondWith('<html>')],
    [
      'a network failure',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
    ],
  ])('keeps the last good rows and logs on %s', async (_label, fetchImpl) => {
    const before = starterIds();
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const result = await syncTierModelCatalog('starter', fetchImpl);

    expect(result.status).toBe('failed');
    expect(starterIds()).toEqual(before);
    expect(replaceTierModels).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'model_catalog_sync_failed',
        tier: 'starter',
      }),
      expect.any(String),
    );
  });

  it('skips without a fetch when the runtime lacks the tier key', async () => {
    vi.stubEnv('OPENROUTER_API_KEY_STARTER', '');
    const fetchImpl = respondWith({ data: [NEW_MODEL] });

    expect(await syncTierModelCatalog('starter', fetchImpl)).toEqual({
      status: 'skipped',
      reason: 'no_tier_key',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('warns once per tier when the runtime lacks the tier key', async () => {
    vi.stubEnv('OPENROUTER_API_KEY_STARTER', '');
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    await syncTierModelCatalog('starter', respondWith({ data: [NEW_MODEL] }));
    await syncTierModelCatalog('starter', respondWith({ data: [NEW_MODEL] }));

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'model_catalog_sync_skipped_no_key',
        tier: 'starter',
      }),
      expect.any(String),
    );
  });
});

describe('getTierModels', () => {
  it('reads fresh rows without refreshing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const models = await getTierModels('starter');

    expect(models.map((m) => m.id).sort()).toEqual(
      MODEL_CATALOG_FIXTURE.starter.map((m) => m.modelId).sort(),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refreshes stale rows before reading', async () => {
    seedModelCatalogFixture(new Date(Date.now() - MODEL_CATALOG_TTL_MS - 1));
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: [NEW_MODEL] })));

    const models = await getTierModels('starter');

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(models.map((m) => m.id)).toEqual(['openai/gpt-5.2']);
  });

  it('syncs before reading when the tier has no rows', async () => {
    await inMemoryModelCatalogStore.replaceTierModels(
      'starter',
      [],
      new Date(),
    );
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: [NEW_MODEL] })));

    const models = await getTierModels('starter');

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(models.map((m) => m.id)).toEqual(['openai/gpt-5.2']);
  });

  it('runs its own query for each concurrent read', async () => {
    vi.mocked(selectTierModels).mockClear();

    await Promise.all([getTierModels('starter'), getTierModels('starter')]);

    expect(selectTierModels).toHaveBeenCalledTimes(2);
  });

  it('serves stale rows after a failed refresh and backs off', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    seedModelCatalogFixture(new Date(Date.now() - MODEL_CATALOG_TTL_MS - 1));
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('down', { status: 503 }));

    const first = await getTierModels('starter');
    await getTierModels('starter');

    expect(first.map((m) => m.id).sort()).toEqual([...starterIds()].sort());
    expect(fetchSpy).toHaveBeenCalledOnce();

    vi.setSystemTime(Date.now() + MODEL_CATALOG_RETRY_MS + 1);
    await getTierModels('starter');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('shares one refresh between concurrent stale reads', async () => {
    seedModelCatalogFixture(new Date(Date.now() - MODEL_CATALOG_TTL_MS - 1));
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () => new Response(JSON.stringify({ data: [NEW_MODEL] })),
      );

    await Promise.all([getTierModels('starter'), getTierModels('starter')]);

    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});

describe('getCatalogModel', () => {
  it('returns synced pricing for a listed model and null otherwise', async () => {
    expect(await getCatalogModel('deepseek/deepseek-v4.1-flash')).toMatchObject(
      { inputCostPerMillion: 0.07, outputCostPerMillion: 0.5 },
    );
    expect(await getCatalogModel('vendor/not-in-any-guardrail')).toBeNull();
  });

  it('prefers the most recently synced row across tiers', async () => {
    await inMemoryModelCatalogStore.replaceTierModels(
      'pro',
      MODEL_CATALOG_FIXTURE.pro.map((model) =>
        model.modelId === 'openai/gpt-6-luna'
          ? { ...model, inputCostPerMillion: 0.2 }
          : model,
      ),
      new Date(Date.now() + 1_000),
    );

    expect(await getCatalogModel('openai/gpt-6-luna')).toMatchObject({
      inputCostPerMillion: 0.2,
    });
  });

  it('warns once when pricing comes from seeded rows no sync replaced', async () => {
    seedModelCatalogFixture(new Date(0));
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    await getCatalogModel('openai/gpt-6-luna');
    await getCatalogModel('openai/gpt-6-luna');

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'model_catalog_seed_pricing',
        modelId: 'openai/gpt-6-luna',
      }),
      expect.any(String),
    );
  });
});

describe('getMemoizedCatalogModel', () => {
  it('does not remember an unknown model', async () => {
    vi.mocked(selectCatalogModel).mockClear();

    await getMemoizedCatalogModel('vendor/listed-later');
    await getMemoizedCatalogModel('vendor/listed-later');

    expect(selectCatalogModel).toHaveBeenCalledTimes(2);
  });

  it('does not remember a lookup that raced a sync', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(selectCatalogModel).mockImplementationOnce(async (modelId) => {
      await gate;
      return inMemoryModelCatalogStore.selectCatalogModel(modelId);
    });
    const lookup = getMemoizedCatalogModel('openai/gpt-6-luna');

    seedModelCatalogFixture(new Date(Date.now() - MODEL_CATALOG_TTL_MS - 1));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [NEW_MODEL] })),
    );
    await getTierModels('starter');
    release();
    await lookup;

    vi.mocked(selectCatalogModel).mockClear();
    await getMemoizedCatalogModel('openai/gpt-6-luna');
    expect(selectCatalogModel).toHaveBeenCalledOnce();
  });
});
