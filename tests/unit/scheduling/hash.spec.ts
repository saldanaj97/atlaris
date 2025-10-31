import { describe, expect, it } from 'vitest';
import { computeInputsHash } from '@/lib/scheduling/hash';
import type { ScheduleInputs } from '@/lib/scheduling/types';

describe('computeInputsHash', () => {
  it('should produce same hash for identical inputs', () => {
    const inputs: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [
        {
          id: 'task-1',
          title: 'Learn TypeScript',
          estimatedMinutes: 60,
          order: 1,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-01',
      deadline: '2025-03-01',
      weeklyHours: 10,
      timezone: 'America/New_York',
    };

    const hash1 = computeInputsHash(inputs);
    const hash2 = computeInputsHash(inputs);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
  });

  it('should produce same hash when input array order changes but task.order remains the same', () => {
    const inputs1: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          estimatedMinutes: 60,
          order: 1,
          moduleId: 'mod-1',
        },
        {
          id: 'task-2',
          title: 'Task 2',
          estimatedMinutes: 60,
          order: 2,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-01',
      deadline: '2025-03-01',
      weeklyHours: 10,
      timezone: 'America/New_York',
    };

    const inputs2: ScheduleInputs = {
      ...inputs1,
      tasks: [inputs1.tasks[1], inputs1.tasks[0]], // Swapped order
    };

    const hash1 = computeInputsHash(inputs1);
    const hash2 = computeInputsHash(inputs2);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hash when task.order values change', () => {
    const inputs1: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          estimatedMinutes: 60,
          order: 1,
          moduleId: 'mod-1',
        },
        {
          id: 'task-2',
          title: 'Task 2',
          estimatedMinutes: 60,
          order: 2,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-01',
      deadline: '2025-03-01',
      weeklyHours: 10,
      timezone: 'America/New_York',
    };

    const inputs2: ScheduleInputs = {
      ...inputs1,
      tasks: [
        { ...inputs1.tasks[0], order: 2 },
        { ...inputs1.tasks[1], order: 1 },
      ],
    };

    const hash1 = computeInputsHash(inputs1);
    const hash2 = computeInputsHash(inputs2);

    expect(hash1).not.toBe(hash2);
  });

  it('should produce different hash when start date changes', () => {
    const inputs1: ScheduleInputs = {
      planId: 'plan-123',
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          estimatedMinutes: 60,
          order: 1,
          moduleId: 'mod-1',
        },
      ],
      startDate: '2025-02-01',
      deadline: '2025-03-01',
      weeklyHours: 10,
      timezone: 'America/New_York',
    };

    const inputs2: ScheduleInputs = {
      ...inputs1,
      startDate: '2025-02-02',
    };

    const hash1 = computeInputsHash(inputs1);
    const hash2 = computeInputsHash(inputs2);

    expect(hash1).not.toBe(hash2);
  });
});
