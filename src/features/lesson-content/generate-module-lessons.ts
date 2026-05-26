import type {
  GenerateModuleLessonsDeps,
  GenerateModuleLessonsParams,
  GenerateModuleLessonsResult,
  ModuleLessonGenerationWorkResult,
  RunModuleLessonGenerationAfterClaimParams,
} from '@/features/lesson-content/generate-module-lessons.types';

import { classifyModuleLessonGenerationPreflight } from '@/features/lesson-content/module-lesson-generation-preflight';
import { runModuleLessonGenerationWork } from '@/features/lesson-content/run-module-lesson-generation-work';
import { lessonContentEnv } from '@/lib/config/env/lesson-content';
import {
  claimModuleLessonGenerationOrDescribe,
  loadModuleLessonGenerationContext,
} from '@/lib/db/queries/module-lesson-generation';
import { db as serviceRoleDb } from '@supabase/service-role';

export type {
  GenerateModuleLessonsDeps,
  GenerateModuleLessonsParams,
  GenerateModuleLessonsResult,
  ModuleLessonGenerationWorkResult,
  RunModuleLessonGenerationAfterClaimParams,
} from '@/features/lesson-content/generate-module-lessons.types';

export {
  runModuleLessonGenerationAfterClaim,
  runModuleLessonGenerationWork,
} from '@/features/lesson-content/run-module-lesson-generation-work';

/**
 * Ownership-scoped module lesson batch: CAS → model/provider → parse → single transaction persist (tasks + module + usage).
 * On provider/parser failure after claim, persists `failed` without partial task writes.
 * Monthly lesson quota reserved only after successful claim; reverted on failure paths.
 */
export async function generateModuleLessons(
  params: GenerateModuleLessonsParams,
  deps: GenerateModuleLessonsDeps = {},
): Promise<GenerateModuleLessonsResult> {
  if (!lessonContentEnv.generationEnabled) {
    return { kind: 'disabled' };
  }

  const nowFn = params.now ?? (() => new Date());
  const serverDbClient = deps.serverDbClient ?? serviceRoleDb;

  const load = await loadModuleLessonGenerationContext(
    params.dbClient,
    params.planId,
    params.moduleId,
    params.userId,
  );

  const preflight = classifyModuleLessonGenerationPreflight(load);
  if (preflight.kind !== 'eligible') {
    return preflight;
  }

  const claim = await claimModuleLessonGenerationOrDescribe(
    serverDbClient,
    params.planId,
    params.moduleId,
    params.userId,
    nowFn,
  );

  if (claim.kind !== 'claimed') {
    return claim;
  }

  return runModuleLessonGenerationWork(
    {
      load: preflight.load,
      userId: params.userId,
      planId: params.planId,
      moduleId: params.moduleId,
      userTier: params.userTier,
      modelOverride: params.modelOverride,
      signal: params.signal,
      timeoutConfig: params.timeoutConfig,
      now: params.now,
      generationMetadata: params.generationMetadata,
    },
    deps,
  );
}
