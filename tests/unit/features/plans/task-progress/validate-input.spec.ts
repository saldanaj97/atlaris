import {
  TASK_PROGRESS_MAX_BATCH,
  validateTaskProgressBatchInput,
} from '@/features/plans/task-progress/boundary';
import { describe, expect, it } from 'vitest';

describe('validateTaskProgressBatchInput', () => {
  it('accepts valid batches', () => {
    expect(() =>
      validateTaskProgressBatchInput({
        planId: 'plan-1',
        moduleId: 'module-1',
        updates: [{ taskId: 'task-1', status: 'completed' }],
      }),
    ).not.toThrow();
  });

  it('accepts max-sized batches', () => {
    const updates = Array.from(
      { length: TASK_PROGRESS_MAX_BATCH },
      (_, index) => ({
        taskId: `task-${index}`,
        status: 'completed' as const,
      }),
    );

    expect(() =>
      validateTaskProgressBatchInput({ planId: 'plan-1', updates }),
    ).not.toThrow();
  });

  it('rejects oversized batches', () => {
    const updates = Array.from(
      { length: TASK_PROGRESS_MAX_BATCH + 1 },
      (_, index) => ({
        taskId: `task-${index}`,
        status: 'completed' as const,
      }),
    );
    expect(() =>
      validateTaskProgressBatchInput({ planId: 'plan-1', updates }),
    ).toThrow(
      `Batch update limit exceeded: received ${TASK_PROGRESS_MAX_BATCH + 1} updates, but the maximum allowed is ${TASK_PROGRESS_MAX_BATCH}.`,
    );
  });

  it('rejects duplicate task ids after trimming', () => {
    expect(() =>
      validateTaskProgressBatchInput({
        planId: 'plan-1',
        updates: [
          { taskId: ' task-1 ', status: 'completed' },
          { taskId: 'task-1', status: 'in_progress' },
        ],
      }),
    ).toThrow('Duplicate taskIds in updates: task-1');
  });

  it.each(['', '   '])('requires module id when provided as %j', (moduleId) => {
    expect(() =>
      validateTaskProgressBatchInput({
        planId: 'plan-1',
        moduleId,
        updates: [{ taskId: 't1', status: 'completed' }],
      }),
    ).toThrow('A module id is required to update progress.');
  });
});
