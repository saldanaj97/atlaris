import { describe, expect, it } from 'vitest';

import {
  buildResourcesByTask,
  computeModuleNavItems,
} from '@/lib/db/queries/helpers/modules-helpers';
import type {
  ModuleNavRaw,
  ModuleResourceRow,
} from '@/lib/db/queries/types/modules.types';

const BASE_DATE = new Date('2026-01-01T00:00:00.000Z');

function buildResourceRow(
  overrides: Partial<ModuleResourceRow>
): ModuleResourceRow {
  return {
    id: overrides.id ?? 'task-resource-1',
    taskId: overrides.taskId ?? 'task-1',
    resourceId: overrides.resourceId ?? 'resource-1',
    order: overrides.order ?? 1,
    notes: overrides.notes ?? null,
    createdAt: overrides.createdAt ?? BASE_DATE,
    resource: {
      id: overrides.resource?.id ?? 'resource-1',
      type: overrides.resource?.type ?? 'article',
      title: overrides.resource?.title ?? 'Article',
      url: overrides.resource?.url ?? 'https://example.com/article',
      domain: overrides.resource?.domain ?? 'example.com',
      author: overrides.resource?.author ?? 'Author',
      durationMinutes: overrides.resource?.durationMinutes ?? 30,
      costCents: overrides.resource?.costCents ?? null,
      currency: overrides.resource?.currency ?? null,
      tags: overrides.resource?.tags ?? [],
      createdAt: overrides.resource?.createdAt ?? BASE_DATE,
    },
  };
}

describe('modules helpers', () => {
  describe('computeModuleNavItems', () => {
    it('keeps all modules unlocked when prior modules are fully completed', () => {
      const moduleRows: ModuleNavRaw[] = [
        { id: 'm1', order: 1, title: 'Module 1' },
        { id: 'm2', order: 2, title: 'Module 2' },
        { id: 'm3', order: 3, title: 'Module 3' },
      ];

      const tasksByModule = new Map<string, string[]>([
        ['m1', ['t1']],
        ['m2', ['t2']],
        ['m3', ['t3']],
      ]);

      const completedTaskIds = new Set(['t1', 't2', 't3']);

      const result = computeModuleNavItems(
        moduleRows,
        tasksByModule,
        completedTaskIds
      );

      expect(result).toEqual([
        { id: 'm1', order: 1, title: 'Module 1', isLocked: false },
        { id: 'm2', order: 2, title: 'Module 2', isLocked: false },
        { id: 'm3', order: 3, title: 'Module 3', isLocked: false },
      ]);
    });

    it('locks every module after first incomplete task is encountered in previous modules', () => {
      const moduleRows: ModuleNavRaw[] = [
        { id: 'm1', order: 1, title: 'Module 1' },
        { id: 'm2', order: 2, title: 'Module 2' },
        { id: 'm3', order: 3, title: 'Module 3' },
      ];

      const tasksByModule = new Map<string, string[]>([
        ['m1', ['t1', 't2']],
        ['m2', ['t3']],
        ['m3', ['t4']],
      ]);

      const completedTaskIds = new Set(['t1', 't3', 't4']);

      const result = computeModuleNavItems(
        moduleRows,
        tasksByModule,
        completedTaskIds
      );

      expect(result).toEqual([
        { id: 'm1', order: 1, title: 'Module 1', isLocked: false },
        { id: 'm2', order: 2, title: 'Module 2', isLocked: true },
        { id: 'm3', order: 3, title: 'Module 3', isLocked: true },
      ]);
    });

    it('does not lock later modules when previous modules have no tasks', () => {
      const moduleRows: ModuleNavRaw[] = [
        { id: 'm1', order: 1, title: 'Module 1' },
        { id: 'm2', order: 2, title: 'Module 2' },
      ];

      const tasksByModule = new Map<string, string[]>([['m2', ['t2']]]);
      const completedTaskIds = new Set<string>();

      const result = computeModuleNavItems(
        moduleRows,
        tasksByModule,
        completedTaskIds
      );

      expect(result).toEqual([
        { id: 'm1', order: 1, title: 'Module 1', isLocked: false },
        { id: 'm2', order: 2, title: 'Module 2', isLocked: false },
      ]);
    });
  });

  describe('buildResourcesByTask', () => {
    it('groups task resources by task id while preserving row order per task', () => {
      const rows: ModuleResourceRow[] = [
        buildResourceRow({ id: 'tr-1', taskId: 't1', order: 1 }),
        buildResourceRow({ id: 'tr-2', taskId: 't1', order: 2 }),
        buildResourceRow({ id: 'tr-3', taskId: 't2', order: 1 }),
      ];

      const result = buildResourcesByTask(rows);

      expect(result.get('t1')).toHaveLength(2);
      expect(result.get('t1')?.map((row) => row.id)).toEqual(['tr-1', 'tr-2']);
      expect(result.get('t2')).toHaveLength(1);
      expect(result.get('t2')?.[0].id).toBe('tr-3');
    });
  });
});
