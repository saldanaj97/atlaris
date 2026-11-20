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
export const syncFailingSinceByTier = new Map<SubscriptionTier, number>();
export const alertedSyncFailingTiers = new Set<SubscriptionTier>();
export const warnedNoKeyTiers = new Set<SubscriptionTier>();
export const warnedSeedPricingModels = new Set<string>();
export const memoizedCatalogModels = new Map<
  string,
  { readonly model: AvailableModel; readonly expiresAt: number }
>();
export const catalogSyncGeneration = { value: 0 };

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
