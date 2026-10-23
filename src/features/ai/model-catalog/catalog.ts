/**
 * Each tier's model list and metadata, synced from its OpenRouter guardrail
 * into `openrouter_tier_models` (DEV-174). A guardrail change reaches users on
 * the next refresh, with no code change or deploy.
 *
 * Refresh-on-read: a read whose rows are older than {@link MODEL_CATALOG_TTL_MS}
 * (or missing) syncs that tier first, when this runtime has the tier's own key.
 * The jobs Worker has no tier keys, so it only reads what the app synced (or
 * the migration seeded).
 */

import type { AvailableModel } from '@/features/ai/types/model.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  catalogSyncGeneration,
  inFlightSyncs,
  memoizedCatalogModels,
  retryAfterByTier,
  warnedNoKeyTiers,
  warnedSeedPricingModels,
} from '@/features/ai/model-catalog/catalog-state';
import {
  fetchGuardrailModels,
  type GuardrailModel,
} from '@/features/ai/model-catalog/guardrail-models';
import {
  type OpenRouterTierModelRow,
  replaceTierModels,
  selectCatalogModel,
  selectTierModels,
} from '@/features/ai/model-catalog/store';
import { openRouterEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';
import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';

export const MODEL_CATALOG_TTL_MS = 15 * 60_000;

/** After a failed sync, reads use the stored rows this long before retrying. */
export const MODEL_CATALOG_RETRY_MS = 60_000;

const GUARDRAIL_FETCH_TIMEOUT_MS = 5_000;

/**
 * `openrouter/free` is a router, not a model, so no guardrail lists it. It
 * stays code-owned: free, with no output limit of its own.
 */
export const FREE_ROUTER_MODEL: AvailableModel = {
  id: AI_DEFAULT_MODEL,
  name: 'Free Models Router',
  provider: 'OpenRouter',
  description:
    'Routes each request to a compatible free OpenRouter model. Zero cost, but the exact backend and output limits vary by request.',
  tier: 'free',
  contextWindow: 200_000,
  inputCostPerMillion: 0,
  outputCostPerMillion: 0,
};

export type TierModelSyncResult =
  | { readonly status: 'synced'; readonly models: readonly GuardrailModel[] }
  | { readonly status: 'skipped'; readonly reason: 'no_tier_key' }
  | { readonly status: 'failed'; readonly error: unknown };

function toAvailableModel(row: OpenRouterTierModelRow): AvailableModel {
  return {
    id: row.modelId,
    name: row.name,
    provider: row.provider,
    description: row.description,
    tier:
      row.inputCostPerMillion === 0 && row.outputCostPerMillion === 0
        ? 'free'
        : 'pro',
    contextWindow: row.contextLength,
    ...(row.maxOutputTokens === null
      ? {}
      : { maxOutputTokens: row.maxOutputTokens }),
    inputCostPerMillion: row.inputCostPerMillion,
    outputCostPerMillion: row.outputCostPerMillion,
  };
}

/**
 * Fetches `tier`'s guardrail list and replaces its rows. Any failure (no key,
 * HTTP, unparseable or empty list, DB) keeps the last good rows.
 */
export async function syncTierModelCatalog(
  tier: SubscriptionTier,
  fetchImpl: typeof fetch = fetch,
): Promise<TierModelSyncResult> {
  const apiKey = openRouterEnv.guardrailKeyForTier(tier);
  if (!apiKey) {
    if (!warnedNoKeyTiers.has(tier)) {
      warnedNoKeyTiers.add(tier);
      logger.warn(
        { tier, event: 'model_catalog_sync_skipped_no_key' },
        'No OpenRouter guardrail key for this tier; serving the stored models without syncing',
      );
    }
    return { status: 'skipped', reason: 'no_tier_key' };
  }
  try {
    const models = await fetchGuardrailModels({
      apiKey,
      timeoutMs: GUARDRAIL_FETCH_TIMEOUT_MS,
      fetchImpl,
    });
    await replaceTierModels(tier, models, new Date());
    logger.info(
      { tier, modelCount: models.length, event: 'model_catalog_synced' },
      'Synced tier model catalog from OpenRouter guardrail',
    );
    return { status: 'synced', models };
  } catch (error) {
    logger.error(
      { tier, err: error, event: 'model_catalog_sync_failed' },
      'Tier model catalog sync failed; keeping the last synced models',
    );
    return { status: 'failed', error };
  }
}

export { resetModelCatalogStateForTests } from '@/features/ai/model-catalog/catalog-state';

/**
 * One sync per tier per process at a time; backs off after a failure. Only
 * the app syncs (the Worker has no tier keys), so a shared sync never runs on
 * another Workflow step's database pool.
 */
async function refreshTier(tier: SubscriptionTier): Promise<boolean> {
  if (Date.now() < (retryAfterByTier.get(tier) ?? 0)) {
    return false;
  }
  let pending = inFlightSyncs.get(tier);
  if (!pending) {
    pending = syncTierModelCatalog(tier).finally(() => {
      inFlightSyncs.delete(tier);
    });
    inFlightSyncs.set(tier, pending);
  }
  const result = await pending;
  if (result.status === 'failed') {
    retryAfterByTier.set(tier, Date.now() + MODEL_CATALOG_RETRY_MS);
  }
  if (result.status === 'synced') {
    catalogSyncGeneration.value += 1;
    memoizedCatalogModels.clear();
  }
  return result.status === 'synced';
}

function isStale(rows: readonly OpenRouterTierModelRow[]): boolean {
  if (rows.length === 0) {
    return true;
  }
  const oldest = Math.min(...rows.map((row) => row.syncedAt.getTime()));
  return Date.now() - oldest > MODEL_CATALOG_TTL_MS;
}

/**
 * `tier`'s guardrail models, refreshed first when stale. Concurrent reads of a
 * tier share one refresh, but each runs its own query: in the jobs Worker the
 * database is bound per Workflow step, so a shared query could run on another
 * step's pool.
 */
export async function getTierModels(
  tier: SubscriptionTier,
): Promise<AvailableModel[]> {
  let rows = await selectTierModels(tier);
  // Awaited: a serverless runtime may stop un-awaited work after the response.
  if (isStale(rows) && (await refreshTier(tier))) {
    rows = await selectTierModels(tier);
  }
  return rows.map(toAvailableModel);
}

/**
 * Pricing and limits for `modelId` from any tier's synced list, or `null` when
 * no guardrail lists it. Throws when the catalog cannot be read.
 */
export async function getCatalogModel(
  modelId: string,
): Promise<AvailableModel | null> {
  if (modelId === AI_DEFAULT_MODEL) {
    return FREE_ROUTER_MODEL;
  }
  const row = await selectCatalogModel(modelId);
  if (!row) {
    return null;
  }
  // Epoch rows come from the seed migration and no sync has replaced them,
  // so their prices are the pre-guardrail code list, not OpenRouter's.
  if (row.syncedAt.getTime() === 0 && !warnedSeedPricingModels.has(modelId)) {
    warnedSeedPricingModels.add(modelId);
    logger.warn(
      { modelId, event: 'model_catalog_seed_pricing' },
      'Pricing a model from seeded catalog rows that no sync has replaced',
    );
  }
  return toAvailableModel(row);
}

/**
 * {@link getCatalogModel}, remembered per process for
 * {@link MODEL_CATALOG_TTL_MS} (cleared by a sync), for per-call lookups such
 * as output ceilings. Failed reads, unknown models and lookups that raced a
 * sync are not remembered.
 */
export async function getMemoizedCatalogModel(
  modelId: string,
): Promise<AvailableModel | null> {
  const memo = memoizedCatalogModels.get(modelId);
  if (memo && memo.expiresAt > Date.now()) {
    return memo.model;
  }
  const generation = catalogSyncGeneration.value;
  const model = await getCatalogModel(modelId);
  if (model && generation === catalogSyncGeneration.value) {
    memoizedCatalogModels.set(modelId, {
      model,
      expiresAt: Date.now() + MODEL_CATALOG_TTL_MS,
    });
  }
  return model;
}
