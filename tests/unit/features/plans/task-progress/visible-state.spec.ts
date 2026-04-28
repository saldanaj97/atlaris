import { buildModule, buildTask } from '@tests/fixtures/plan-detail';
import { createTestPlanDetail } from '@tests/fixtures/plans';
import { describe, expect, it } from 'vitest';
import {
  buildTaskStatusMap,
  deriveActiveModuleId,
  deriveCompletedModuleIds,
  deriveFirstUnlockedIncompleteLessonId,
  deriveLessonLocks,
  deriveModuleCompletionSummary,
  deriveModuleProgressState,
  derivePlanDetailsCardStats,
  derivePlanOverviewStats,
} from '@/features/plans/task-progress/client';
import type { ClientModule } from '@/shared/types/client.types';

const plan = createTestPlanDetail();

describe('task-progress visible-state', () => {
  it('buildTaskStatusMap matches flattened module tasks', () => {
    const modules = plan.modules ?? [];
    const map = buildTaskStatusMap(modules);
    const t0 = modules[0]?.tasks?.[0];
    const t1 = modules[0]?.tasks?.[1];
    if (!t0 || !t1) throw new Error('fixture tasks');
    expect(map[t0.id]).toBe('completed');
    expect(map[t1.id]).toBe('not_started');
  });

  it('derivePlanOverviewStats ignores orphaned status keys', () => {
    const m = plan.modules?.[0];
    if (!m?.tasks?.[0] || !m.tasks[1]) throw new Error('fixture');
    const stats = derivePlanOverviewStats(plan, {
      [m.tasks[0].id]: 'completed',
      [m.tasks[1].id]: 'not_started',
      orphaned: 'completed',
    });
    expect(stats.completedTasks).toBe(1);
    expect(stats.completionPercentage).toBe(50);
  });

  it('derivePlanDetailsCardStats ignores orphaned status keys', () => {
    const m = plan.modules?.[0];
    if (!m?.tasks?.[0] || !m.tasks[1]) throw new Error('fixture');
    const stats = derivePlanDetailsCardStats(plan, {
      [m.tasks[0].id]: 'completed',
      [m.tasks[1].id]: 'not_started',
      orphaned: 'completed',
    });
    expect(stats.completedTasks).toBe(1);
    expect(stats.completionPercentage).toBe(50);
  });

  it('deriveModuleProgressState returns locked then active when prior incomplete', () => {
    const modA: ClientModule = {
      id: 'm-a',
      order: 1,
      title: 'A',
      description: null,
      estimatedMinutes: 10,
      tasks: [
        {
          id: 't-a1',
          order: 1,
          title: 'a1',
          description: null,
          estimatedMinutes: 5,
          status: 'not_started',
          resources: [],
        },
      ],
    };
    const modB: ClientModule = {
      id: 'm-b',
      order: 2,
      title: 'B',
      description: null,
      estimatedMinutes: 10,
      tasks: [
        {
          id: 't-b1',
          order: 1,
          title: 'b1',
          description: null,
          estimatedMinutes: 5,
          status: 'not_started',
          resources: [],
        },
      ],
    };
    const statuses = {
      't-a1': 'not_started' as const,
      't-b1': 'not_started' as const,
    };
    expect(deriveModuleProgressState(modA, statuses, true)).toBe('active');
    expect(deriveModuleProgressState(modB, statuses, false)).toBe('locked');
  });

  it('deriveActiveModuleId advances when prior module completes', () => {
    const modules: ClientModule[] = [
      {
        id: 'm1',
        order: 1,
        title: 'M1',
        description: null,
        estimatedMinutes: 10,
        tasks: [
          {
            id: 'a',
            order: 1,
            title: 'a',
            description: null,
            estimatedMinutes: 5,
            status: 'completed',
            resources: [],
          },
        ],
      },
      {
        id: 'm2',
        order: 2,
        title: 'M2',
        description: null,
        estimatedMinutes: 10,
        tasks: [
          {
            id: 'b',
            order: 1,
            title: 'b',
            description: null,
            estimatedMinutes: 5,
            status: 'not_started',
            resources: [],
          },
        ],
      },
    ];
    const s1 = { a: 'completed' as const, b: 'not_started' as const };
    expect(deriveActiveModuleId(modules, s1)).toBe('m2');
    const s2 = { a: 'completed' as const, b: 'completed' as const };
    expect(deriveActiveModuleId(modules, s2)).toBe(null);
  });

  it('deriveActiveModuleId uses persisted task status when overrides are sparse', () => {
    const modules: ClientModule[] = [
      {
        id: 'm1',
        order: 1,
        title: 'M1',
        description: null,
        estimatedMinutes: 10,
        tasks: [
          {
            id: 'a',
            order: 1,
            title: 'a',
            description: null,
            estimatedMinutes: 5,
            status: 'completed',
            resources: [],
          },
        ],
      },
      {
        id: 'm2',
        order: 2,
        title: 'M2',
        description: null,
        estimatedMinutes: 10,
        tasks: [
          {
            id: 'b',
            order: 1,
            title: 'b',
            description: null,
            estimatedMinutes: 5,
            status: 'not_started',
            resources: [],
          },
        ],
      },
    ];

    expect(deriveActiveModuleId(modules, {})).toBe('m2');
  });

  it('deriveCompletedModuleIds lists only fully completed modules', () => {
    const modules: ClientModule[] = [
      {
        id: 'm1',
        order: 1,
        title: 'M1',
        description: null,
        estimatedMinutes: 10,
        tasks: [
          {
            id: 'x',
            order: 1,
            title: 'x',
            description: null,
            estimatedMinutes: 5,
            status: 'completed',
            resources: [],
          },
          {
            id: 'y',
            order: 2,
            title: 'y',
            description: null,
            estimatedMinutes: 5,
            status: 'not_started',
            resources: [],
          },
        ],
      },
    ];
    expect(
      deriveCompletedModuleIds(modules, { x: 'completed', y: 'not_started' })
        .size,
    ).toBe(0);
    expect(
      deriveCompletedModuleIds(modules, { x: 'completed', y: 'completed' }),
    ).toEqual(new Set(['m1']));
  });

  it('deriveCompletedModuleIds uses persisted task status when overrides are sparse', () => {
    const modules: ClientModule[] = [
      {
        id: 'm1',
        order: 1,
        title: 'M1',
        description: null,
        estimatedMinutes: 10,
        tasks: [
          {
            id: 'x',
            order: 1,
            title: 'x',
            description: null,
            estimatedMinutes: 5,
            status: 'completed',
            resources: [],
          },
        ],
      },
    ];

    expect(deriveCompletedModuleIds(modules, {})).toEqual(new Set(['m1']));
  });

  it('deriveLessonLocks gates on previous modules and sequential completion', () => {
    const lessons = [{ id: 'L1' }, { id: 'L2' }, { id: 'L3' }];
    expect(deriveLessonLocks(lessons, {}, false)).toEqual([true, true, true]);
    expect(deriveLessonLocks(lessons, { L1: 'not_started' }, true)).toEqual([
      false,
      true,
      true,
    ]);
    expect(
      deriveLessonLocks(lessons, { L1: 'completed', L2: 'not_started' }, true),
    ).toEqual([false, false, true]);
  });

  it('deriveFirstUnlockedIncompleteLessonId skips locked and completed', () => {
    const lessons = [{ id: 'L1' }, { id: 'L2' }];
    expect(
      deriveFirstUnlockedIncompleteLessonId(
        lessons,
        { L1: 'completed', L2: 'not_started' },
        true,
      ),
    ).toBe('L2');
    expect(
      deriveFirstUnlockedIncompleteLessonId(
        lessons,
        { L1: 'completed', L2: 'completed' },
        true,
      ),
    ).toBeUndefined();
  });

  it('deriveModuleCompletionSummary counts completed like module header', () => {
    const module = buildModule({
      id: 'mod',
      planId: 'p',
      order: 1,
      title: 'T',
      description: null,
      estimatedMinutes: 60,
      tasks: [
        buildTask({
          id: 'u',
          moduleId: 'mod',
          order: 1,
          title: 'u',
          description: null,
          estimatedMinutes: 30,
          resources: [],
        }),
        buildTask({
          id: 'v',
          moduleId: 'mod',
          order: 2,
          title: 'v',
          description: null,
          estimatedMinutes: 30,
          resources: [],
        }),
      ],
    });
    const s = deriveModuleCompletionSummary(module, {
      u: 'completed',
      v: 'not_started',
    });
    expect(s.totalTasks).toBe(2);
    expect(s.completedTasks).toBe(1);
    expect(s.completionPercent).toBe(50);
    expect(s.totalMinutes).toBe(60);
  });

  it('deriveModuleCompletionSummary uses persisted progress when overrides are sparse', () => {
    const module = buildModule({
      id: 'mod',
      tasks: [
        buildTask({
          id: 'u',
          moduleId: 'mod',
          estimatedMinutes: 30,
          progress: {
            id: 'progress-1',
            taskId: 'u',
            userId: 'user-1',
            status: 'completed',
            completedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        }),
        buildTask({
          id: 'v',
          moduleId: 'mod',
          estimatedMinutes: 30,
          progress: null,
        }),
      ],
    });

    const summary = deriveModuleCompletionSummary(module, {});

    expect(summary.completedTasks).toBe(1);
    expect(summary.completionPercent).toBe(50);
  });
});
