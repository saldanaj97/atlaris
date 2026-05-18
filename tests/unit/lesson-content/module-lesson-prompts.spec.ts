import { describe, expect, it } from 'vitest';

import { MAX_LESSON_BLOCK_TEXT_LENGTH } from '@supabase/schema/constants';

import {
  buildModuleLessonBatchSystemPrompt,
  buildModuleLessonBatchUserPrompt,
  type ModuleLessonBatchPromptInput,
} from '@/features/lesson-content/module-lesson-prompts';
import { createId } from '@tests/fixtures/ids';

describe('module lesson batch prompts', () => {
  const taskA = createId('task');
  const taskB = createId('task');

  const baseInput = (
    estimatedMinutesA = 20,
    estimatedMinutesB = 30,
  ): ModuleLessonBatchPromptInput => ({
    plan: {
      topic: 'Algebra foundations',
      skillLevel: 'beginner',
      learningStyle: 'visual',
    },
    module: {
      title: 'Intro module',
      description: 'Covers basics',
      order: 1,
    },
    tasks: [
      {
        taskId: taskA,
        order: 1,
        title: 'Variables',
        description: 'Define a variable',
        estimatedMinutes: estimatedMinutesA,
        hasMicroExplanation: true,
      },
      {
        taskId: taskB,
        order: 2,
        title: 'Expressions',
        estimatedMinutes: estimatedMinutesB,
      },
    ],
  });

  it('system prompt mandates JSON shape, block kinds, caps, and strict task order', () => {
    const prompt = buildModuleLessonBatchSystemPrompt();
    expect(prompt).toContain('Output strictly JSON only');
    expect(prompt).toContain('"version":1');
    expect(prompt).toContain('heading');
    expect(prompt).toContain('completion_criteria');
    expect(prompt).toContain('Preserve task order');
    expect(prompt).toContain('no duplicate `taskId`');
  });

  it('user prompt wraps untrusted input in delimiters and repeats task ids in DB order', () => {
    const input = baseInput();
    const user = buildModuleLessonBatchUserPrompt(input);
    expect(user).toContain('---BEGIN USER INPUT---');
    expect(user).toContain('---END USER INPUT---');
    expect(user).toContain(input.plan.topic);
    expect(user).toContain(input.module.title);
    expect(user).toContain(`taskId: ${taskA}`);
    expect(user).toContain(`taskId: ${taskB}`);
    const firstId = user.indexOf(`taskId: ${taskA}`);
    const secondId = user.indexOf(`taskId: ${taskB}`);
    expect(firstId).toBeLessThan(secondId);
    expect(user).toContain('hasMicroExplanation: true');
    expect(user).toContain('suggestedTotalBodyBudgetCharsApprox');
  });

  it('scales the suggested body budget with estimated minutes and caps it', () => {
    const prompt = buildModuleLessonBatchUserPrompt(baseInput(5, 1000));
    const budgets = [
      ...prompt.matchAll(/suggestedTotalBodyBudgetCharsApprox: (\d+)/g),
    ].map(([, value]) => Number(value));

    expect(budgets).toHaveLength(2);
    expect(budgets[1]).toBeGreaterThan(budgets[0]);
    expect(budgets[1]).toBe(MAX_LESSON_BLOCK_TEXT_LENGTH * 3);
  });
});
