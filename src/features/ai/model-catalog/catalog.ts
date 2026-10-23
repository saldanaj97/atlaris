/**
 * Each tier's model list and metadata, synced from its OpenRouter guardrail
 * into `openrouter_tier_models` (DEV-174). A guardrail change reaches users on
 * the next refresh, with no code change or deploy.
 *
 * Refresh-on-read: a read whose rows are missing syncs that tier first; a read
 * whose rows are older than {@link MODEL_CATALOG_TTL_MS} returns them and syncs
 * in the background. Either needs the tier's own key. The jobs Worker has no
 * tier keys, so it only reads what the app synced (or the migration seeded).
 */

import type { AvailableModel } from '@/features/ai/types/model.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

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

const inFlightSyncs = new Map<SubscriptionTier, Promise<TierModelSyncResult>>();
const retryAfterByTier = new Map<SubscriptionTier, number>();
/** Logged once per process: the jobs Worker never has tier keys. */
const warnedNoKeyTiers = new Set<SubscriptionTier>();
const inFlightReads = new Map<SubscriptionTier, Promise<AvailableModel[]>>();
const memoizedCatalogModels = new Map<
  string,
  { readonly model: AvailableModel | null; readonly expiresAt: number }
>();

/** One sync per tier per process at a time; backs off after a failure. */
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

async function readTierModels(
  tier: SubscriptionTier,
): Promise<AvailableModel[]> {
  let rows = await selectTierModels(tier);
  if (rows.length === 0) {
    if (await refreshTier(tier)) {
      rows = await selectTierModels(tier);
    }
  } else if (isStale(rows)) {
    // Serve the stale rows; the next read sees the refresh. A sync logs and
    // never rejects, so nothing is lost by not awaiting it.
    void refreshTier(tier);
  }
  return rows.map(toAvailableModel);
}

/**
 * `tier`'s guardrail models: synced first when none are stored, refreshed in
 * the background when stale. Concurrent reads of a tier share one query.
 */
export async function getTierModels(
  tier: SubscriptionTier,
): Promise<AvailableModel[]> {
  let pending = inFlightReads.get(tier);
  if (!pending) {
    pending = readTierModels(tier).finally(() => {
      inFlightReads.delete(tier);
    });
    inFlightReads.set(tier, pending);
  }
  return pending;
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
  return row ? toAvailableModel(row) : null;
}

/**
 * {@link getCatalogModel}, remembered per process for
 * {@link MODEL_CATALOG_TTL_MS} (cleared by a sync), for per-call lookups such
 * as output ceilings. Failed reads are not remembered.
 */
export async function getMemoizedCatalogModel(
  modelId: string,
): Promise<AvailableModel | null> {
  const memo = memoizedCatalogModels.get(modelId);
  if (memo && memo.expiresAt > Date.now()) {
    return memo.model;
  }
  const model = await getCatalogModel(modelId);
  memoizedCatalogModels.set(modelId, {
    model,
    expiresAt: Date.now() + MODEL_CATALOG_TTL_MS,
  });
  return model;
}

/** Test-only: clears the per-process sync, read and lookup state. */
export function resetModelCatalogStateForTests(): void {
  inFlightSyncs.clear();
  retryAfterByTier.clear();
  warnedNoKeyTiers.clear();
  inFlightReads.clear();
  memoizedCatalogModels.clear();
}
