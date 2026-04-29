import { z } from 'zod';

/**
 * Versioned JSON stored on `ai_usage_events.model_pricing_snapshot`.
 * Explains how app-estimated `cost_cents` was derived from the local catalog.
 */

const ModelPricingSnapshotV1Schema = z
  .object({
    version: z.literal(1),
    source: z.literal('local_catalog'),
    requestedModelId: z.string().min(1),
    pricedModelId: z.string().min(1),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    inputCostUsdPerMillion: z.number().finite().nonnegative(),
    outputCostUsdPerMillion: z.number().finite().nonnegative(),
  })
  .strict();

export const ModelPricingSnapshotSchema = z.discriminatedUnion('version', [
  ModelPricingSnapshotV1Schema,
]);

export type ModelPricingSnapshotV1 = z.infer<
  typeof ModelPricingSnapshotV1Schema
>;
export type ModelPricingSnapshot = z.infer<typeof ModelPricingSnapshotSchema>;
