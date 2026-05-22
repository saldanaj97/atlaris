import {
  getNextExpandedModuleIds,
  getVisibleExpandedModuleIds,
} from '@/app/(app)/plans/[id]/components/plan-timeline-state';
import type { ClientModule } from '@/shared/types/client.types';
import { describe, expect, it } from 'vitest';

function createModule(id: string, tasks: ClientModule['tasks']): ClientModule {
  return {
    id,
    order: Number.parseInt(id.replace('module-', ''), 10),
    title: id,
    description: null,
    estimatedMinutes: 30,
    tasks,
  };
}

function createTask(
  id: string,
  status: 'completed' | 'not_started' = 'not_started',
) {
  return {
    id,
    order: Number.parseInt(id.replace('task-', ''), 10),
    title: id,
    description: null,
    estimatedMinutes: 30,
    status,
    resources: [],
  };
}

describe('plan-timeline-state', () => {
  it('forces the active module into visible expanded ids', () => {
    expect(getVisibleExpandedModuleIds(['module-2'], 'module-1')).toEqual([
      'module-2',
      'module-1',
    ]);
  });

  it('collapses completed modules and opens the next active module', () => {
    const modules = [
      createModule('module-1', [createTask('task-1', 'completed')]),
      createModule('module-2', [createTask('task-2')]),
    ];

    expect(
      getNextExpandedModuleIds({
        previousExpandedModuleIds: ['module-1'],
        modules,
        nextStatuses: { 'task-1': 'completed' },
      }),
    ).toEqual(['module-2']);
  });
});
