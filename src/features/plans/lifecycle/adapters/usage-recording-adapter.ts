/**
 * UsageRecordingAdapter — production implementation of UsageRecordingPort.
 *
 * Thin wrapper around `recordUsage()` from the DB usage module.
 */

import { recordUsage } from '@/lib/db/usage';

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
  }
}
