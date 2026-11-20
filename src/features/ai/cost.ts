import type { AvailableModel } from '@/features/ai/types/model.types';

import {
  getCatalogModel,
  getMemoizedCatalogModel,
} from '@/features/ai/model-catalog/catalog';
import { logger } from '@/lib/logging/logger';

export const DEFAULT_OUTPUT_TOKEN_CEILING = 32_768;

export class UnknownModelError extends Error {
  constructor(public readonly modelId: string) {
    super(
      `Unknown model "${modelId}" in computeCostCents — cannot determine pricing.`,
    );
    this.name = 'UnknownModelError';
  }
}

export class ModelCatalogUnavailableError extends Error {
  constructor(
    public readonly modelId: string,
    options?: ErrorOptions,
  ) {
    super(
      `Model catalog unavailable in computeCostCents for "${modelId}" — cannot determine pricing.`,
      options,
    );
    this.name = 'ModelCatalogUnavailableError';
  }
}

async function lookUpPricedModel(
  modelId: string,
  lookUp: (modelId: string) => Promise<AvailableModel | null>,
): Promise<AvailableModel | null> {
  try {
    return await lookUp(modelId);
  } catch (error) {
    throw new ModelCatalogUnavailableError(modelId, { cause: error });
  }
}

export async function computeCostCents(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<number> {
  if (
    !Number.isFinite(inputTokens) ||
    !Number.isFinite(outputTokens) ||
    inputTokens < 0 ||
    outputTokens < 0
  ) {
    throw new Error(
      `Invalid token counts: inputTokens=${inputTokens}, outputTokens=${outputTokens}. Values must be finite and >= 0.`,
    );
  }

  const model = await lookUpPricedModel(modelId, getCatalogModel);
  if (!model) {
    logger.error({ modelId }, 'Unknown model in computeCostCents');
    throw new UnknownModelError(modelId);
  }
  if (inputTokens === 0 && outputTokens === 0) return 0;

  const totalUsd =
    (inputTokens / 1_000_000) * model.inputCostPerMillion +
    (outputTokens / 1_000_000) * model.outputCostPerMillion;

  return Math.round(totalUsd * 100);
}

export async function getOutputTokenCeiling(modelId: string): Promise<number> {
  let model: AvailableModel | null;
  try {
    model = await lookUpPricedModel(modelId, getMemoizedCatalogModel);
  } catch (error) {
    logger.error(
      {
        modelId,
        err: error instanceof Error ? error.cause : error,
        event: 'model_catalog_unavailable',
      },
      'Model catalog read failed — falling back to DEFAULT_OUTPUT_TOKEN_CEILING',
    );
    return DEFAULT_OUTPUT_TOKEN_CEILING;
  }
  if (!model) {
    logger.warn(
      { modelId },
      'Unknown model in getOutputTokenCeiling — falling back to DEFAULT_OUTPUT_TOKEN_CEILING',
    );
    return DEFAULT_OUTPUT_TOKEN_CEILING;
  }
  return model.maxOutputTokens ?? DEFAULT_OUTPUT_TOKEN_CEILING;
}
