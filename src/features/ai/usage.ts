/**
 * Canonical AI usage normalization and cost computation.
 *
 * This module bridges raw provider metadata (ProviderMetadata) to the
 * canonical usage shape (CanonicalAIUsage). All persistence and billing
 * code should consume CanonicalAIUsage — never raw metadata fields.
 */

import { getModelById } from '@/features/ai/ai-models';
import { logger } from '@/lib/logging/logger';
import type { ProviderMetadata } from '@/shared/types/ai-provider.types';
import {
  type CanonicalAIUsage,
  IncompleteUsageError,
} from '@/shared/types/ai-usage.types';
import * as Sentry from '@sentry/nextjs';

/**
 * Compute estimated cost in USD cents from model pricing and token counts.
 * Returns 0 when the model is not in the registry or both counts are zero.
 */
export function computeCostCents(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const model = getModelById(modelId);
  if (!model) {
    return 0;
  }
  if (inputTokens === 0 && outputTokens === 0) return 0;
  const totalUsd =
    (inputTokens / 1_000_000) * model.inputCostPerMillion +
    (outputTokens / 1_000_000) * model.outputCostPerMillion;
  return Math.round(totalUsd * 100);
}

/**
 * Strictly normalize provider metadata into a CanonicalAIUsage.
 *
 * Throws {@link IncompleteUsageError} if any required field (provider,
 * model, inputTokens, outputTokens) is missing or undefined. The error
 * carries a best-effort `partialUsage` so callers can still record data
 * after logging.
 */
export function normalizeToCanonicalUsage(
  metadata: ProviderMetadata | undefined
): CanonicalAIUsage {
  const missingFields: string[] = [];

  const provider = metadata?.provider;
  const model = metadata?.model;
  const usage = metadata?.usage;

  if (!provider) missingFields.push('provider');
  if (!model) missingFields.push('model');
  if (usage?.promptTokens == null) missingFields.push('inputTokens');
  if (usage?.completionTokens == null) missingFields.push('outputTokens');

  const resolvedProvider = provider ?? 'unknown';
  const resolvedModel = model ?? 'unknown';
  const resolvedInputTokens = usage?.promptTokens ?? 0;
  const resolvedOutputTokens = usage?.completionTokens ?? 0;
  const resolvedTotalTokens =
    usage?.totalTokens ?? resolvedInputTokens + resolvedOutputTokens;
  const estimatedCostCents = computeCostCents(
    resolvedModel,
    resolvedInputTokens,
    resolvedOutputTokens
  );

  const canonical: CanonicalAIUsage = {
    inputTokens: resolvedInputTokens,
    outputTokens: resolvedOutputTokens,
    totalTokens: resolvedTotalTokens,
    model: resolvedModel,
    provider: resolvedProvider,
    estimatedCostCents,
  };

  if (missingFields.length > 0) {
    throw new IncompleteUsageError(
      `Incomplete AI usage data: missing [${missingFields.join(', ')}] from ${resolvedProvider}/${resolvedModel}`,
      canonical,
      missingFields
    );
  }

  return canonical;
}

/**
 * Normalize provider metadata to canonical usage, logging an explicit
 * error (never silently defaulting) when data is incomplete.
 *
 * Always returns a {@link CanonicalAIUsage} so downstream recording can
 * proceed, but missing fields are surfaced via structured logs and Sentry.
 */
export function safeNormalizeUsage(
  metadata: ProviderMetadata | undefined
): CanonicalAIUsage {
  try {
    return normalizeToCanonicalUsage(metadata);
  } catch (error) {
    if (error instanceof IncompleteUsageError) {
      logger.error(
        {
          source: 'canonical-usage',
          event: 'incomplete_usage_data',
          missingFields: error.missingFields,
          partialUsage: error.partialUsage,
        },
        error.message
      );
      Sentry.captureException(error, {
        level: 'warning',
        tags: { source: 'canonical-usage' },
        extra: {
          missingFields: error.missingFields,
          partialUsage: error.partialUsage,
        },
      });
      return error.partialUsage;
    }
    throw error;
  }
}
