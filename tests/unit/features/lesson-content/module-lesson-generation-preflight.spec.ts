import { classifyModuleLessonGenerationPreflight } from '@/features/lesson-content/module-lesson-generation-preflight';
import { describe, expect, it } from 'vitest';

describe('classifyModuleLessonGenerationPreflight', () => {
  it('treats a found module as eligible even if isUnlocked is the only remaining gate', () => {
    const result = classifyModuleLessonGenerationPreflight({
      isUnlocked: true,
      module: { lessonGenerationStatus: 'not_generated' },
      plan: {},
      tasks: [],
    } as never);

    expect(result).toMatchObject({ kind: 'eligible' });
  });

  it('keeps locked only when isUnlocked is false', () => {
    const result = classifyModuleLessonGenerationPreflight({
      isUnlocked: false,
      module: { lessonGenerationStatus: 'not_generated' },
      plan: {},
      tasks: [],
    } as never);

    expect(result).toEqual({ kind: 'locked' });
  });
});
