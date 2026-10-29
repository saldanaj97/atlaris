/**
 * Per-process state of the model catalog, kept apart from `catalog.ts` so
 * unit test setup can reset it without importing the logger and env.
 */

import type { TierModelSyncResult } from '@/features/ai/model-catalog/catalog';
import type { AvailableModel } from '@/features/ai/types/model.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

export const inFlightSyncs = new Map<
  SubscriptionTier,
  Promise<TierModelSyncResult>
>();
export const retryAfterByTier = new Map<SubscriptionTier, number>();
/** When each tier's current run of failed syncs began; a sync clears it. */
export const syncFailingSinceByTier = new Map<SubscriptionTier, number>();
/** Tiers already alerted for their current run of failed syncs. */
export const alertedSyncFailingTiers = new Set<SubscriptionTier>();
/** Logged once per process: the jobs Worker never has tier keys. */
export const warnedNoKeyTiers = new Set<SubscriptionTier>();
/** Logged once per process per model priced from a never-synced seed row. */
export const warnedSeedPricingModels = new Set<string>();
export const memoizedCatalogModels = new Map<
  string,
  { readonly model: AvailableModel; readonly expiresAt: number }
>();
/** Bumped by each sync, so a lookup that raced it is not memoized. */
export const catalogSyncGeneration = { value: 0 };

/** Test-only: clears the per-process sync, warning and lookup state. */
export function resetModelCatalogStateForTests(): void {
  inFlightSyncs.clear();
  retryAfterByTier.clear();
  syncFailingSinceByTier.clear();
  alertedSyncFailingTiers.clear();
  warnedNoKeyTiers.clear();
  warnedSeedPricingModels.clear();
  memoizedCatalogModels.clear();
  catalogSyncGeneration.value = 0;
}
