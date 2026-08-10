/**
 * Canonical AI usage normalization.
 *
 * This module bridges raw provider metadata (ProviderMetadata) to the
 * canonical usage shape (CanonicalAIUsage). All persistence and billing
 * code should consume CanonicalAIUsage — never raw metadata fields.
 *
 * Cost computation is delegated to `@/features/ai/cost` — the single
 * source of truth for pricing and output-token ceilings.
 */

import type { ProviderMetadata } from '@/shared/types/ai-provider.types';

import { computeCostCents, UnknownModelError } from '@/features/ai/cost';
import { usdCostToMicrousdInteger } from '@/features/ai/provider-cost-microusd';
import { logger } from '@/lib/logging/logger';
import {
  type CanonicalAIUsage,
  type CanonicalUsageMissingField,
  IncompleteUsageError,
} from '@/shared/types/ai-usage.types';
import * as Sentry from '@sentry/nextjs';

function collectMissingFields(
  metadata: ProviderMetadata | undefined,
): CanonicalUsageMissingField[] {
  const missingFields: CanonicalUsageMissingField[] = [];
  const usage = metadata?.usage;

  if (!metadata?.provider) missingFields.push('provider');
  if (!metadata?.model) missingFields.push('model');
  if (usage?.promptTokens == null) missingFields.push('inputTokens');
  if (usage?.completionTokens == null) missingFields.push('outputTokens');

  return missingFields;
}

function computeEstimatedCostCents(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  provider: string;
}): number {
  const { model, inputTokens, outputTokens, provider } = args;

  try {
    return computeCostCents(model, inputTokens, outputTokens);
  } catch (error) {
    if (error instanceof UnknownModelError) {
      logger.warn(
        {
          source: 'canonical-usage',
          event: 'unknown_model_cost_skipped',
          modelId: model,
          provider,
        },
        `Unknown model "${model}" — recording 0 estimated cost`,
      );
      return 0;
    }

    throw error;
  }
}

function resolveProviderCostMicrousd(
  usage: ProviderMetadata['usage'] | undefined,
  isPartial: boolean,
): number | null {
  if (isPartial) {
    return null;
  }

  const usd = usage?.providerReportedCostUsd;
  return usd != null &&
    typeof usd === 'number' &&
    Number.isFinite(usd) &&
    usd >= 0
    ? usdCostToMicrousdInteger(usd)
    : null;
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
  metadata: ProviderMetadata | undefined,
): CanonicalAIUsage {
  const missingFields = collectMissingFields(metadata);
  const provider = metadata?.provider;
  const model = metadata?.model;
  const usage = metadata?.usage;

  const resolvedProvider = provider ?? 'unknown';
  const resolvedModel = model ?? 'unknown';
  const resolvedInputTokens = usage?.promptTokens ?? 0;
  const resolvedOutputTokens = usage?.completionTokens ?? 0;
  const resolvedTotalTokens =
    usage?.totalTokens ?? resolvedInputTokens + resolvedOutputTokens;
  // Mock providers and synthetic flows legitimately call this with models
  // that are not in the pricing registry; record cost as 0 in that case but
  // log it explicitly so the silent path stops being invisible. Any other
  // error from computeCostCents (invalid token counts, registry bug) must
  // propagate.
  const isPartial = missingFields.length > 0;
  const estimatedCostCents = isPartial
    ? 0
    : computeEstimatedCostCents({
        model: resolvedModel,
        inputTokens: resolvedInputTokens,
        outputTokens: resolvedOutputTokens,
        provider: resolvedProvider,
      });
  const providerCostMicrousd = resolveProviderCostMicrousd(usage, isPartial);

  const canonical: CanonicalAIUsage = {
    inputTokens: resolvedInputTokens,
    outputTokens: resolvedOutputTokens,
    totalTokens: resolvedTotalTokens,
    model: resolvedModel,
    provider: resolvedProvider,
    estimatedCostCents,
    providerCostMicrousd,
    isPartial,
    missingFields,
  };

  if (isPartial) {
    throw new IncompleteUsageError(
      `Incomplete AI usage data: missing [${missingFields.join(', ')}] from ${resolvedProvider}/${resolvedModel}`,
      canonical,
      missingFields,
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
  metadata: ProviderMetadata | undefined,
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
        error.message,
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
