import type { GenerateModuleLessonsResult } from '@/features/lesson-content/generate-module-lessons.types';
import type { ModuleLessonGenerationContext } from '@/lib/db/queries/module-lesson-generation';

export type ModuleLessonEligibleContext = {
  readonly kind: 'eligible';
  readonly load: ModuleLessonGenerationContext;
};

export type ModuleLessonPreflightResult =
  | Exclude<
      GenerateModuleLessonsResult,
      'success' | 'failed' | 'quota_denied' | 'disabled'
    >
  | ModuleLessonEligibleContext;

export function classifyModuleLessonGenerationPreflight(
  load: ModuleLessonGenerationContext | null,
): ModuleLessonPreflightResult {
  if (!load) {
    return { kind: 'not_found' };
  }

  if (!load.isUnlocked) {
    return { kind: 'locked' };
  }

  const status = load.module.lessonGenerationStatus;
  if (status === 'ready') {
    return { kind: 'already_ready' };
  }
  if (status === 'generating') {
    return { kind: 'in_flight' };
  }

  return { kind: 'eligible', load };
}
