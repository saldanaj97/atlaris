import type { PlanGenerationFailureMarker } from '@/features/plans/lifecycle/service';
import type { DbClient } from '@/lib/db/types';

import { markPlanGenerationFailure } from '@/features/plans/lifecycle/plan-persistence-store';
import { logger } from '@/lib/logging/logger';
import { MissingRequestDbContextError } from '@supabase/runtime';

function shouldSurfaceMarkFailureError(markErr: unknown): boolean {
  return (
    markErr instanceof TypeError ||
    markErr instanceof ReferenceError ||
    markErr instanceof MissingRequestDbContextError
  );
}

type SafeMarkPlanFailedDeps = {
  logger?: Pick<typeof logger, 'error'>;
};

export async function safeMarkPlanFailed(
  planId: string,
  userId: string,
  persistence: PlanGenerationFailureMarker,
  deps?: SafeMarkPlanFailedDeps,
): Promise<void> {
  const errorLogger = deps?.logger ?? logger;

  try {
    await persistence.markGenerationFailure(planId);
  } catch (markErr) {
    if (shouldSurfaceMarkFailureError(markErr)) {
      throw markErr;
    }
    errorLogger.error(
      {
        error: markErr,
        planId,
        userId,
        context: 'markGenerationFailure-after-generation-error',
      },
      'Failed to mark plan as failed after generation error (persistence path).',
    );
  }
}

export async function safeMarkPlanFailedWithDbClient(
  planId: string,
  userId: string,
  dbClient: DbClient,
  deps?: SafeMarkPlanFailedDeps,
): Promise<void> {
  await safeMarkPlanFailed(
    planId,
    userId,
    {
      markGenerationFailure: (failedPlanId) =>
        markPlanGenerationFailure(failedPlanId, dbClient),
    },
    deps,
  );
}
