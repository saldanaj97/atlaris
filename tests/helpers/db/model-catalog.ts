import { MODEL_CATALOG_FIXTURE } from '../../fixtures/ai-model-catalog';
import { openRouterTierModels } from '@supabase/schema';
import { db } from '@supabase/service-role';

/**
 * Inserts each tier's synced guardrail models from the shared fixture, synced
 * now, so catalog reads stay fresh and never call OpenRouter.
 */
export async function seedModelCatalog(syncedAt: Date = new Date()) {
  await db.insert(openRouterTierModels).values(
    Object.entries(MODEL_CATALOG_FIXTURE).flatMap(([tier, models]) =>
      models.map((model) => ({
        tier: tier as keyof typeof MODEL_CATALOG_FIXTURE,
        ...model,
        supportedParameters: [...model.supportedParameters],
        syncedAt,
      })),
    ),
  );
}
