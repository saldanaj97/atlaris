/**
 * UsageRecordingAdapter — production implementation of UsageRecordingPort.
 *
 * Thin wrapper around `recordUsage()` from the DB usage module.
 */

import { incrementUsage } from '@/features/billing/usage-metrics';
import { recordUsage } from '@/lib/db/usage';
import { logger } from '@/lib/logging/logger';

import type { UsageRecordingPort } from '../ports';

export class UsageRecordingAdapter implements UsageRecordingPort {
  async recordUsage(params: {
    userId: string;
    provider: string;
    model: string;
    inputTokens?: number | null;
    outputTokens?: number | null;
    costCents?: number | null;
    requestId?: string | null;
    kind?: 'plan' | 'regeneration';
  }): Promise<void> {
    await recordUsage(params);

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
