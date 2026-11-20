import type { ProviderMetadata } from '@/shared/types/ai-provider.types';

import {
  computeCostCents,
  ModelCatalogUnavailableError,
  UnknownModelError,
} from '@/features/ai/cost';
import { usdCostToMicrousdInteger } from '@/features/ai/provider-cost-microusd';
import { usageCostMicrousd } from '@/features/billing/plan-ai-budget';
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

async function computeEstimatedCostCents(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  provider: string;
}): Promise<number> {
  const { model, inputTokens, outputTokens, provider } = args;

  try {
    return await computeCostCents(model, inputTokens, outputTokens);
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
    if (error instanceof ModelCatalogUnavailableError) {
      // Not an unknown model: the price exists but could not be read. The row
      // still records, with provider-reported cost when OpenRouter sent it.
      logger.error(
        {
          source: 'canonical-usage',
          event: 'model_catalog_unavailable_cost_skipped',
          modelId: model,
          provider,
          err: error.cause,
        },
        `Model catalog unavailable for "${model}" — recording 0 estimated cost`,
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

export async function normalizeToCanonicalUsage(
  metadata: ProviderMetadata | undefined,
): Promise<CanonicalAIUsage> {
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
  const isPartial = missingFields.length > 0;
  const estimatedCostCents = isPartial
    ? 0
    : await computeEstimatedCostCents({
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

export async function safeNormalizeUsage(
  metadata: ProviderMetadata | undefined,
): Promise<CanonicalAIUsage> {
  try {
    return await normalizeToCanonicalUsage(metadata);
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

export function sumUsages(
  usages: readonly [CanonicalAIUsage, ...CanonicalAIUsage[]],
): CanonicalAIUsage {
  const [first] = usages;
  const missingFields = [...new Set(usages.flatMap((u) => u.missingFields))];
  return {
    inputTokens: usages.reduce((sum, u) => sum + u.inputTokens, 0),
    outputTokens: usages.reduce((sum, u) => sum + u.outputTokens, 0),
    totalTokens: usages.reduce((sum, u) => sum + u.totalTokens, 0),
    model: first.model,
    provider: first.provider,
    estimatedCostCents: usages.reduce(
      (sum, u) => sum + u.estimatedCostCents,
      0,
    ),
    providerCostMicrousd: usages.some((u) => u.providerCostMicrousd !== null)
      ? usages.reduce((sum, u) => sum + usageCostMicrousd(u), 0)
      : null,
    isPartial: usages.some((u) => u.isPartial),
    missingFields,
  };
}

const billedUsageByError = new WeakMap<object, CanonicalAIUsage>();

export async function completeUsageOrNull(
  metadata: ProviderMetadata,
): Promise<CanonicalAIUsage | null> {
  try {
    return await normalizeToCanonicalUsage(metadata);
  } catch (error) {
    if (error instanceof IncompleteUsageError) {
      return null;
    }
    throw error;
  }
}

export async function withBilledUsage<T>(
  usage: () => Promise<CanonicalAIUsage | null>,
  use: () => Promise<T>,
): Promise<T> {
  try {
    return await use();
  } catch (error) {
    if (typeof error === 'object' && error !== null) {
      const billed = await usage();
      if (billed) {
        billedUsageByError.set(error, billed);
      } else {
        logger.warn(
          { source: 'canonical-usage', event: 'discarded_call_usage_unknown' },
          'A discarded AI call has no usage; its cost is not recorded',
        );
      }
    }
    throw error;
  }
}

export function billedUsageOf(error: unknown): CanonicalAIUsage | null {
  return typeof error === 'object' && error !== null
    ? (billedUsageByError.get(error) ?? null)
    : null;
}
