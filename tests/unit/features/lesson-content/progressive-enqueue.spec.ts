import {
  enqueueModuleLessonGenerations,
  isProgressiveLessonThresholdMet,
  selectFirstProgressiveLessonModuleIds,
  selectProgressiveFollowUpModuleId,
  sortModulesForProgressiveLessons,
} from '@/features/lesson-content/progressive-enqueue';
import { createId } from '@tests/fixtures/ids';
import { describe, expect, it, vi } from 'vitest';

const moduleA = { id: 'mod-a', order: 1 };
const moduleB = { id: 'mod-b', order: 2 };
const moduleC = { id: 'mod-c', order: 3 };
const moduleD = { id: 'mod-d', order: 4 };

describe('progressive lesson selection', () => {
  it('sorts by order then id', () => {
    const laterId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const earlierId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    expect(
      sortModulesForProgressiveLessons([
        { id: laterId, order: 1 },
        { id: earlierId, order: 1 },
        { id: 'mod-z', order: 0 },
      ]).map((module) => module.id),
    ).toEqual(['mod-z', earlierId, laterId]);
  });

  it('selects the first two stably ordered modules', () => {
    expect(
      selectFirstProgressiveLessonModuleIds([moduleC, moduleA, moduleB]),
    ).toEqual([moduleA.id, moduleB.id]);
  });

  it('selects every module when fewer than two exist', () => {
    expect(selectFirstProgressiveLessonModuleIds([moduleA])).toEqual([
      moduleA.id,
    ]);
    expect(selectFirstProgressiveLessonModuleIds([])).toEqual([]);
  });

  it('selects module N+2 by order then id', () => {
    expect(
      selectProgressiveFollowUpModuleId(
        [moduleD, moduleA, moduleC, moduleB],
        moduleA.id,
      ),
    ).toBe(moduleC.id);
    expect(
      selectProgressiveFollowUpModuleId(
        [moduleA, moduleB, moduleC],
        moduleB.id,
      ),
    ).toBeNull();
  });

  it('returns null when the current module is missing or has no N+2', () => {
    expect(
      selectProgressiveFollowUpModuleId([moduleA, moduleB], 'missing'),
    ).toBeNull();
    expect(
      selectProgressiveFollowUpModuleId([moduleA, moduleB], moduleB.id),
    ).toBeNull();
  });

  it('uses ceiling(total / 2) and ignores empty modules', () => {
    expect(isProgressiveLessonThresholdMet(1, 2)).toBe(true);
    expect(isProgressiveLessonThresholdMet(1, 3)).toBe(false);
    expect(isProgressiveLessonThresholdMet(2, 3)).toBe(true);
    expect(isProgressiveLessonThresholdMet(0, 1)).toBe(false);
    expect(isProgressiveLessonThresholdMet(0, 0)).toBe(false);
  });
});

describe('enqueueModuleLessonGenerations', () => {
  it('starts generation for each module and swallows start failures', async () => {
    const start = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'workflow_started', runId: 'wrun_1' })
      .mockRejectedValueOnce(new Error('start failed'));

    await expect(
      enqueueModuleLessonGenerations(
        {
          dbClient: {} as never,
          userId: createId('user'),
          planId: createId('plan'),
          moduleIds: [moduleA.id, moduleB.id],
          userTier: 'starter',
          correlationId: 'corr',
        },
        { start },
      ),
    ).resolves.toBeUndefined();

    expect(start).toHaveBeenCalledTimes(2);
  });

  it('treats ready and in-flight as idempotent success', async () => {
    const start = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'already_ready' })
      .mockResolvedValueOnce({ kind: 'in_flight' });

    await enqueueModuleLessonGenerations(
      {
        dbClient: {} as never,
        userId: createId('user'),
        planId: createId('plan'),
        moduleIds: [moduleA.id, moduleB.id],
        userTier: 'pro',
        correlationId: 'corr',
      },
      { start },
    );

    expect(start).toHaveBeenCalledTimes(2);
  });
});
