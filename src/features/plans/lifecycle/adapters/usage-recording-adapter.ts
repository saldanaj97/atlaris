/**
 * UsageRecordingAdapter — production implementation of UsageRecordingPort.
 *
 * Thin wrapper around `recordUsage()` from the DB usage module.
 * Accepts CanonicalAIUsage — all normalization happens upstream.
 */

import { incrementUsage } from '@/features/billing/usage-metrics';
import { recordUsage } from '@/lib/db/usage';
import { logger } from '@/lib/logging/logger';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';

import type { UsageRecordingPort } from '@/features/plans/lifecycle/ports';

export class UsageRecordingAdapter implements UsageRecordingPort {
  async recordUsage(params: {
    userId: string;
    usage: CanonicalAIUsage;
    kind?: 'plan' | 'regeneration';
  }): Promise<void> {
    await recordUsage({
      userId: params.userId,
      provider: params.usage.provider,
      model: params.usage.model,
      inputTokens: params.usage.inputTokens,
      outputTokens: params.usage.outputTokens,
      costCents: params.usage.estimatedCostCents,
    });

    if (params.kind) {
      try {
        await incrementUsage(params.userId, params.kind);
      } catch (error) {
        logger.error(
          {
            error,
            userId: params.userId,
            kind: params.kind,
          },
          'Failed to increment usage aggregate after recording usage event'
        );
        throw error;
      }
    }
  }
}
