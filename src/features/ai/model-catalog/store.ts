/**
 * `openrouter_tier_models` reads and writes. The table is global, server-owned
 * and deny-all under RLS, so every access uses the service-role client.
 */

import type { GuardrailModel } from '@/features/ai/model-catalog/guardrail-models';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  type OpenRouterTierModelRow,
  openRouterTierModels,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { asc, desc, eq, sql } from 'drizzle-orm';

export type { OpenRouterTierModelRow };

/** A tier's synced models, cheapest first. */
export async function selectTierModels(
  tier: SubscriptionTier,
): Promise<OpenRouterTierModelRow[]> {
  return db
    .select()
    .from(openRouterTierModels)
    .where(eq(openRouterTierModels.tier, tier))
    .orderBy(
      asc(openRouterTierModels.inputCostPerMillion),
      asc(openRouterTierModels.outputCostPerMillion),
      asc(openRouterTierModels.name),
    );
}

/** `modelId`'s most recently synced row from any tier, or `null`. */
export async function selectCatalogModel(
  modelId: string,
): Promise<OpenRouterTierModelRow | null> {
  const [row] = await db
    .select()
    .from(openRouterTierModels)
    .where(eq(openRouterTierModels.modelId, modelId))
    .orderBy(desc(openRouterTierModels.syncedAt))
    .limit(1);
  return row ?? null;
}

/**
 * Replaces `tier`'s rows with `models` in one transaction. A per-tier advisory
 * lock serializes concurrent syncs; readers see the old rows or the new ones.
 */
export async function replaceTierModels(
  tier: SubscriptionTier,
  models: readonly GuardrailModel[],
  syncedAt: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`openrouter_tier_models:${tier}`}))`,
    );
    await tx
      .delete(openRouterTierModels)
      .where(eq(openRouterTierModels.tier, tier));
    await tx.insert(openRouterTierModels).values(
      models.map((model) => ({
        tier,
        modelId: model.modelId,
        name: model.name,
        provider: model.provider,
        description: model.description,
        contextLength: model.contextLength,
        maxOutputTokens: model.maxOutputTokens,
        inputCostPerMillion: model.inputCostPerMillion,
        outputCostPerMillion: model.outputCostPerMillion,
        supportedParameters: [...model.supportedParameters],
        syncedAt,
      })),
    );
  });
}
