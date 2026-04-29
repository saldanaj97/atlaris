import { describe, expect, it } from 'vitest';

import {
  buildModuleDetailNavItems,
  buildModuleDetailReadModel,
} from '@/features/plans/read-projection/module-detail';
import type { ModuleDetailRows } from '@/lib/db/queries/types/modules.types';

const BASE = new Date('2025-06-01T00:00:00.000Z');

function rowsForReadModel(
  overrides: Partial<ModuleDetailRows>,
): ModuleDetailRows {
  const planId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const moduleId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  return {
    plan: { id: planId, topic: 'Topic' },
    module: {
      id: moduleId,
      planId,
      order: 1,
      title: 'M1',
      description: 'd',
      estimatedMinutes: 60,
      createdAt: BASE,
      updatedAt: BASE,
    },
    moduleMetricsRows: [
      {
        id: moduleId,
        order: 1,
        title: 'M1',
        totalTaskCount: 1,
        completedTaskCount: 0,
      },
    ],
    taskRows: [
      {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        moduleId,
        order: 1,
        title: 'L1',
        description: null,
        estimatedMinutes: 30,
        hasMicroExplanation: false,
        createdAt: BASE,
        updatedAt: BASE,
      },
    ],
    progressRows: [],
    resourceRows: [],
    ...overrides,
  };
}

describe('module-detail read projection', () => {
  it('buildModuleDetailNavItems locks modules after first incomplete prior module', () => {
    const nav = buildModuleDetailNavItems([
      {
        id: 'a',
        order: 1,
        title: 'A',
        totalTaskCount: 1,
        completedTaskCount: 0,
      },
      {
        id: 'b',
        order: 2,
        title: 'B',
        totalTaskCount: 1,
        completedTaskCount: 0,
      },
    ]);
    expect(nav[0].isLocked).toBe(false);
    expect(nav[1].isLocked).toBe(true);
  });

  it('treats zero-task module as complete for lock advance', () => {
    const nav = buildModuleDetailNavItems([
      {
        id: 'a',
        order: 1,
        title: 'A',
        totalTaskCount: 0,
        completedTaskCount: 0,
      },
      {
        id: 'b',
        order: 2,
        title: 'B',
        totalTaskCount: 1,
        completedTaskCount: 0,
      },
    ]);
    expect(nav[0].isLocked).toBe(false);
    expect(nav[1].isLocked).toBe(false);
  });

  it('buildModuleDetailReadModel maps progress to status and prev/next', () => {
    const planId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const m1 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const m2 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const taskId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    const rows = rowsForReadModel({
      plan: { id: planId, topic: 'T' },
      module: {
        id: m2,
        planId,
        order: 2,
        title: 'M2',
        description: null,
        estimatedMinutes: 40,
        createdAt: BASE,
        updatedAt: BASE,
      },
      moduleMetricsRows: [
        {
          id: m1,
          order: 1,
          title: 'First',
          totalTaskCount: 1,
          completedTaskCount: 1,
        },
        {
          id: m2,
          order: 2,
          title: 'Second',
          totalTaskCount: 1,
          completedTaskCount: 0,
        },
      ],
      taskRows: [
        {
          id: taskId,
          moduleId: m2,
          order: 1,
          title: 'Lesson',
          description: null,
          estimatedMinutes: 30,
          hasMicroExplanation: false,
          createdAt: BASE,
          updatedAt: BASE,
        },
      ],
      progressRows: [
        {
          id: 'pppppppp-pppp-pppp-pppp-pppppppppppp',
          taskId,
          userId: 'uuuuuuuu-uuuu-uuuu-uuuu-uuuuuuuuuuuu',
          status: 'in_progress',
          completedAt: null,
          createdAt: BASE,
          updatedAt: BASE,
        },
      ],
    });

    const model = buildModuleDetailReadModel(rows);
    expect(model).not.toBeNull();
    expect(model!.previousModuleId).toBe(m1);
    expect(model!.nextModuleId).toBeNull();
    expect(model!.previousModulesComplete).toBe(true);
    expect(model!.module.tasks[0].status).toBe('in_progress');
  });

  it('returns null when current module id missing from metrics', () => {
    const planId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const wrongId = '99999999-9999-9999-9999-999999999999';
    const rows = rowsForReadModel({
      module: {
        id: wrongId,
        planId,
        order: 1,
        title: 'Orphan',
        description: null,
        estimatedMinutes: 1,
        createdAt: BASE,
        updatedAt: BASE,
      },
      moduleMetricsRows: [],
    });
    expect(buildModuleDetailReadModel(rows)).toBeNull();
  });

  it('flattens resources in relation order', () => {
    const moduleId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const taskId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    const rows = rowsForReadModel({
      taskRows: [
        {
          id: taskId,
          moduleId,
          order: 1,
          title: 'L1',
          description: null,
          estimatedMinutes: 10,
          hasMicroExplanation: false,
          createdAt: BASE,
          updatedAt: BASE,
        },
      ],
      resourceRows: [
        {
          id: 'r2',
          taskId,
          resourceId: 'res-2',
          order: 2,
          notes: null,
          createdAt: BASE,
          resource: {
            id: 'res-2',
            type: 'article',
            title: 'Second',
            url: 'https://b',
            domain: 'b',
            author: 'a',
            durationMinutes: 5,
            costCents: null,
            currency: null,
            tags: [],
            createdAt: BASE,
          },
        },
        {
          id: 'r1',
          taskId,
          resourceId: 'res-1',
          order: 1,
          notes: 'n',
          createdAt: BASE,
          resource: {
            id: 'res-1',
            type: 'video',
            title: 'First',
            url: 'https://a',
            domain: 'a',
            author: 'a',
            durationMinutes: null,
            costCents: null,
            currency: null,
            tags: [],
            createdAt: BASE,
          },
        },
      ],
    });

    const model = buildModuleDetailReadModel(rows);
    expect(model?.module.tasks[0].resources.map((r) => r.title)).toEqual([
      'First',
      'Second',
    ]);
  });
});
