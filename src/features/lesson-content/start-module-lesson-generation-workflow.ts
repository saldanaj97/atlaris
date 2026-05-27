import type { GenerateModuleLessonsResult } from '@/features/lesson-content/generate-module-lessons.types';
import type { DbClient } from '@/lib/db/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { generateModuleLessons } from '@/features/lesson-content/generate-module-lessons';
import { classifyModuleLessonGenerationPreflight } from '@/features/lesson-content/module-lesson-generation-preflight';
import { moduleLessonGenerationWorkflow } from '@/features/lesson-content/workflows/module-lesson-generation.workflow';
import { lessonContentEnv } from '@/lib/config/env/lesson-content';
import { workflowEnv } from '@/lib/config/env/workflow';
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
  | { readonly kind: 'workflow_started'; readonly runId: string };

export type StartModuleLessonGenerationDeps = {
  readonly isWorkflowEnabled?: () => boolean;
  readonly isGenerationEnabled?: () => boolean;
  readonly loadContext?: (
    dbClient: DbClient,
    planId: string,
    moduleId: string,
    userId: string,
  ) => Promise<ModuleLessonGenerationContext | null>;
  readonly generateFn?: typeof generateModuleLessons;
  readonly workflowStart?: typeof start;
  readonly workflowFn?: typeof moduleLessonGenerationWorkflow;
};

/**
 * Starts module lesson generation synchronously or via Workflow SDK based on
 * `MODULE_LESSON_WORKFLOW_ENABLED`. Lesson generation must be enabled before
 * a workflow run is created (defaults off outside development).
 */
export async function startModuleLessonGeneration(
  params: StartModuleLessonGenerationParams,
  deps: StartModuleLessonGenerationDeps = {},
): Promise<StartModuleLessonGenerationResult> {
  const isWorkflowEnabled =
    deps.isWorkflowEnabled ?? (() => workflowEnv.moduleLessonWorkflowEnabled);
  const isGenerationEnabled =
    deps.isGenerationEnabled ?? (() => lessonContentEnv.generationEnabled);
  const loadContext = deps.loadContext ?? loadModuleLessonGenerationContext;
  const generateFn = deps.generateFn ?? generateModuleLessons;
  const workflowStart = deps.workflowStart ?? start;
  const workflowFn = deps.workflowFn ?? moduleLessonGenerationWorkflow;

  if (!isWorkflowEnabled()) {
    return generateFn({
      dbClient: params.dbClient,
      userId: params.userId,
      planId: params.planId,
      moduleId: params.moduleId,
      userTier: params.userTier,
      modelOverride: params.modelOverride,
      signal: params.signal,
    });
  }

  if (!isGenerationEnabled()) {
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
}
