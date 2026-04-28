/**
 * UsageRecordingAdapter — production implementation of UsageRecordingPort.
 *
 * Thin wrapper around `recordUsage()` from the DB usage module.
 * Accepts CanonicalAIUsage — all normalization happens upstream.
 *
 * Receives an injected `dbClient` so that all DB writes go through the
 * same connection as the rest of the lifecycle (avoiding the closed-connection bug).
 */

import { incrementUsage } from '@/features/billing/usage-metrics';
import type { UsageRecordingPort } from '@/features/plans/lifecycle/ports';
import type { DbClient } from '@/lib/db/types';
import { canonicalUsageToRecordParams, recordUsage } from '@/lib/db/usage';
import { logger } from '@/lib/logging/logger';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';

type UsageRecordingAdapterDependencies = {
  readonly recordUsage?: typeof recordUsage;
  readonly incrementUsage?: typeof incrementUsage;
  readonly canonicalUsageToRecordParams?: typeof canonicalUsageToRecordParams;
};

export class UsageRecordingAdapter implements UsageRecordingPort {
  private readonly recordUsageImpl: typeof recordUsage;
  private readonly incrementUsageImpl: typeof incrementUsage;
  private readonly toRecordParams: typeof canonicalUsageToRecordParams;

  constructor(
    private readonly dbClient: DbClient,
    deps: UsageRecordingAdapterDependencies = {},
  ) {
    this.recordUsageImpl = deps.recordUsage ?? recordUsage;
    this.incrementUsageImpl = deps.incrementUsage ?? incrementUsage;
    this.toRecordParams =
      deps.canonicalUsageToRecordParams ?? canonicalUsageToRecordParams;
  }

  async recordUsage(params: {
    userId: string;
    usage: CanonicalAIUsage;
    kind?: 'plan' | 'regeneration';
  }): Promise<void> {
    await this.recordUsageImpl(
      this.toRecordParams(params.usage, params.userId),
      this.dbClient,
    );

    if (params.kind) {
      try {
        await this.incrementUsageImpl(
          params.userId,
          params.kind,
          this.dbClient,
        );
      } catch (error) {
        logger.error(
          {
            error,
            userId: params.userId,
            kind: params.kind,
          },
          'Failed to increment usage aggregate after recording usage event',
        );
        throw error;
      }
    }
  }
}
