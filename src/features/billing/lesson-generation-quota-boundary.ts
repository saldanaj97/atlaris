/**
 * Module lesson generation quota reservation boundary.
 *
 * Same reserve / work / compensate / reconcile lifecycle as regeneration,
 * keyed to `lessonGeneration` meter and `{ userId, planId, moduleId }` context.
 */

import type { DbClient } from '@/lib/db/types';

import {
    createServiceRoleMeteredBoundaryDeps,
    runMeteredQuotaReserved,
    type MeteredQuotaBoundaryDeps,
    type MeteredQuotaWorkResult,
} from './metered-quota-boundary-core';

export type LessonGenerationQuotaWorkResult<
  TConsumed,
  TReverted = TConsumed,
> = MeteredQuotaWorkResult<TConsumed, TReverted>;

type LessonGenerationQuotaResult<TConsumed, TReverted = TConsumed> =
  | { ok: true; consumed: true; value: TConsumed }
  | {
      ok: true;
      consumed: false;
      value: TReverted;
      reconciliationRequired: boolean;
    }
  | { ok: false; currentCount: number; limit: number };

type LessonGenerationQuotaBoundaryArgs<TConsumed, TReverted = TConsumed> = {
  userId: string;
  planId: string;
  moduleId: string;
  dbClient: DbClient;
  work: () => Promise<LessonGenerationQuotaWorkResult<TConsumed, TReverted>>;
};

export type LessonGenerationQuotaBoundaryDeps = MeteredQuotaBoundaryDeps;

const DEFAULT_DEPS = createServiceRoleMeteredBoundaryDeps('lessonGeneration');

export async function runLessonGenerationQuotaReserved<
  TConsumed,
  TReverted = TConsumed,
>(
  args: LessonGenerationQuotaBoundaryArgs<TConsumed, TReverted>,
  deps: LessonGenerationQuotaBoundaryDeps = DEFAULT_DEPS,
): Promise<LessonGenerationQuotaResult<TConsumed, TReverted>> {
  const { userId, planId, moduleId, dbClient, work } = args;

  return await runMeteredQuotaReserved<
    TConsumed,
    TReverted,
    LessonGenerationQuotaWorkResult<TConsumed, TReverted>
  >(
    {
      userId,
      dbClient,
      work,
      buildWorkThrowContexts: () => ({
        reconciliationContext: { planId, moduleId, userId },
        logContext: { planId, moduleId, userId, reason: 'work_threw' },
      }),
      buildRevertContexts: (workResult) => ({
        reconciliationContext: { planId, moduleId, userId },
        logContext: {
          planId,
          moduleId,
          userId,
          reason: workResult.reason ?? 'work_revert',
        },
      }),
      compensationFailureMessage:
        'Failed to compensate lesson generation usage reservation',
    },
    deps,
  );
}
