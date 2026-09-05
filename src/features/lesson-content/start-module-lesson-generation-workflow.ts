import type { GenerateModuleLessonsResult } from '@/features/lesson-content/generate-module-lessons.types';
import type { ModuleLessonWorkflowInput } from '@/features/lesson-content/workflows/module-lesson-generation.types';
import type { DbClient } from '@/lib/db/types';

import { resolveModuleLessonGenerationEnabled } from '@/features/lesson-content/generation-flag';
import { classifyModuleLessonGenerationPreflight } from '@/features/lesson-content/module-lesson-generation-preflight';
import { moduleLessonGenerationWorkflow } from '@/features/lesson-content/workflows/module-lesson-generation.workflow';
import {
  claimModuleLessonGenerationOrDescribe,
  loadModuleLessonGenerationContext,
  revertModuleLessonGeneratingToNotGenerated,
  type ModuleLessonGenerationContext,
} from '@/lib/db/queries/module-lesson-generation';
import { logger } from '@/lib/logging/logger';
import { db as serviceRoleDb } from '@supabase/service-role';
import { start } from 'workflow/api';

export type StartModuleLessonGenerationParams = {
  readonly dbClient: DbClient;
  readonly userId: string;
  readonly planId: string;
  readonly moduleId: string;
  readonly modelOverride?: string;
  readonly correlationId: string;
};

export type StartModuleLessonGenerationResult =
  | GenerateModuleLessonsResult
  | { readonly kind: 'workflow_started'; readonly runId: string }
  | { readonly kind: 'workflow_start_failed'; readonly message: string };

export type StartModuleLessonGenerationDeps = {
  readonly dbClient?: DbClient;
  readonly isGenerationEnabled?: () => boolean | Promise<boolean>;
  readonly claim?: typeof claimModuleLessonGenerationOrDescribe;
  readonly loadContext?: (
    dbClient: DbClient,
    planId: string,
    moduleId: string,
    userId: string,
  ) => Promise<ModuleLessonGenerationContext | null>;
  readonly revert?: typeof revertModuleLessonGeneratingToNotGenerated;
  readonly workflowStart?: (
    workflowFn: typeof moduleLessonGenerationWorkflow,
    args: [ModuleLessonWorkflowInput],
  ) => Promise<{
    readonly runId: string;
    readonly returnValue: Promise<unknown>;
  }>;
  readonly workflowFn?: typeof moduleLessonGenerationWorkflow;
};

/**
 * Starts module lesson generation through Workflow SDK. The
 * `module-lesson-generation` Vercel Flag must be enabled before a workflow run
 * is created (fail-closed).
 */
export async function startModuleLessonGeneration(
  params: StartModuleLessonGenerationParams,
  deps: StartModuleLessonGenerationDeps = {},
): Promise<StartModuleLessonGenerationResult> {
  const isGenerationEnabled =
    deps.isGenerationEnabled ?? resolveModuleLessonGenerationEnabled;
  const dbClient = deps.dbClient ?? serviceRoleDb;
  const claim = deps.claim ?? claimModuleLessonGenerationOrDescribe;
  const loadContext = deps.loadContext ?? loadModuleLessonGenerationContext;
  const revert = deps.revert ?? revertModuleLessonGeneratingToNotGenerated;
  const workflowStart = deps.workflowStart ?? start;
  const workflowFn = deps.workflowFn ?? moduleLessonGenerationWorkflow;

  if (!(await isGenerationEnabled())) {
    return { kind: 'disabled' };
  }

  const load = await loadContext(
    params.dbClient,
    params.planId,
    params.moduleId,
    params.userId,
  );

  const preflight = classifyModuleLessonGenerationPreflight(load);
  if (preflight.kind !== 'eligible') {
    return preflight;
  }

  const provisionalClaim = await claim(
    dbClient,
    params.planId,
    params.moduleId,
    params.userId,
    { batchRequestId: params.correlationId },
  );
  if (provisionalClaim.kind !== 'claimed') {
    return provisionalClaim;
  }

  try {
    const run = await workflowStart(workflowFn, [
      {
        userId: params.userId,
        planId: params.planId,
        moduleId: params.moduleId,
        modelOverride: params.modelOverride,
        correlationId: params.correlationId,
      },
    ]);

    void run.returnValue.catch(async (error: unknown) => {
      try {
        await revert(dbClient, {
          userId: params.userId,
          planId: params.planId,
          moduleId: params.moduleId,
          workflowRunId: run.runId,
          batchRequestId: params.correlationId,
        });
      } catch (revertError) {
        logger.error(
          {
            err: revertError,
            planId: params.planId,
            moduleId: params.moduleId,
            correlationId: params.correlationId,
            workflowRunId: run.runId,
          },
          'Failed to revert rejected module lesson generation workflow claim',
        );
      }
      logger.error(
        {
          err: error,
          planId: params.planId,
          moduleId: params.moduleId,
          correlationId: params.correlationId,
          workflowRunId: run.runId,
        },
        'Module lesson generation workflow failed',
      );
    });

    return { kind: 'workflow_started', runId: run.runId };
  } catch (error) {
    try {
      await revert(dbClient, {
        userId: params.userId,
        planId: params.planId,
        moduleId: params.moduleId,
        batchRequestId: params.correlationId,
      });
    } catch (revertError) {
      logger.error(
        {
          err: revertError,
          planId: params.planId,
          moduleId: params.moduleId,
          correlationId: params.correlationId,
        },
        'Failed to revert provisional module lesson generation claim',
      );
    }
    logger.error(
      {
        err: error,
        planId: params.planId,
        moduleId: params.moduleId,
        correlationId: params.correlationId,
      },
      'Failed to start module lesson generation workflow',
    );
    return {
      kind: 'workflow_start_failed',
      message: 'Module lesson generation could not be started.',
    };
  }
}
