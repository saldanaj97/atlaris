import type { GenerateModuleLessonsResult } from '@/features/lesson-content/generate-module-lessons.types';
import type { DbClient } from '@/lib/db/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { resolveModuleLessonGenerationEnabled } from '@/features/lesson-content/generation-flag';
import { classifyModuleLessonGenerationPreflight } from '@/features/lesson-content/module-lesson-generation-preflight';
import { moduleLessonGenerationWorkflow } from '@/features/lesson-content/workflows/module-lesson-generation.workflow';
import {
  loadModuleLessonGenerationContext,
  type ModuleLessonGenerationContext,
} from '@/lib/db/queries/module-lesson-generation';
import { start } from 'workflow/api';

export type StartModuleLessonGenerationParams = {
  readonly dbClient: DbClient;
  readonly userId: string;
  readonly planId: string;
  readonly moduleId: string;
  readonly userTier: SubscriptionTier;
  readonly modelOverride?: string;
  readonly signal?: AbortSignal;
  readonly correlationId: string;
};

export type StartModuleLessonGenerationResult =
  | GenerateModuleLessonsResult
  | { readonly kind: 'workflow_started'; readonly runId: string }
  | { readonly kind: 'workflow_start_failed'; readonly message: string };

export type StartModuleLessonGenerationDeps = {
  readonly isGenerationEnabled?: () => boolean | Promise<boolean>;
  readonly loadContext?: (
    dbClient: DbClient,
    planId: string,
    moduleId: string,
    userId: string,
  ) => Promise<ModuleLessonGenerationContext | null>;
  readonly workflowStart?: typeof start;
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
  const loadContext = deps.loadContext ?? loadModuleLessonGenerationContext;
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

  try {
    const run = await workflowStart(workflowFn, [
      {
        userId: params.userId,
        planId: params.planId,
        moduleId: params.moduleId,
        userTier: params.userTier,
        modelOverride: params.modelOverride,
        correlationId: params.correlationId,
      },
    ]);

    return { kind: 'workflow_started', runId: run.runId };
  } catch {
    return {
      kind: 'workflow_start_failed',
      message: 'Module lesson generation could not be started.',
    };
  }
}
