import { describe, expect, it } from 'vitest';
import {
  computeDetailsCardStats,
  computeOverviewStats,
} from '@/app/plans/[id]/helpers';
import type { ClientPlanDetail } from '@/shared/types/client.types';

const plan: ClientPlanDetail = {
  id: 'plan-1',
  topic: 'TypeScript',
  skillLevel: 'beginner',
  weeklyHours: 5,
  learningStyle: 'mixed',
  visibility: 'private',
  origin: 'ai',
  createdAt: '2025-01-01T00:00:00.000Z',
  totalTasks: 2,
  completedTasks: 1,
  totalMinutes: 90,
  completedMinutes: 45,
  completedModules: 1,
  status: 'ready',
  latestAttempt: null,
  modules: [
    {
      id: 'module-1',
      order: 1,
      title: 'Basics',
      description: null,
      estimatedMinutes: 90,
      tasks: [
        {
          id: 'task-1',
          order: 1,
          title: 'Intro',
          description: null,
          estimatedMinutes: 45,
          status: 'completed',
          resources: [],
        },
        {
          id: 'task-2',
          order: 2,
          title: 'Practice',
          description: null,
          estimatedMinutes: 45,
          status: 'not_started',
          resources: [],
        },
      ],
    },
  ],
};

describe('plan helper stats', () => {
  it('ignores orphaned status entries in overview stats', () => {
    const stats = computeOverviewStats(plan, {
      'task-1': 'completed',
      'task-2': 'not_started',
      orphaned: 'completed',
    });

    expect(stats.completedTasks).toBe(1);
    expect(stats.totalTasks).toBe(2);
    expect(stats.completionPercentage).toBe(50);
  });

  it('applies real task status changes on top of canonical completed task counts', () => {
    const stats = computeOverviewStats(plan, {
      'task-1': 'not_started',
      'task-2': 'completed',
    });

    expect(stats.completedTasks).toBe(1);
    expect(stats.totalTasks).toBe(2);
    expect(stats.completionPercentage).toBe(50);
  });

  it('uses fallback task statuses when computing completed modules', () => {
    const stats = computeOverviewStats(plan, {
      'task-2': 'completed',
    });

    expect(stats.completedTasks).toBe(2);
    expect(stats.completedModules).toBe(1);
    expect(stats.completionPercentage).toBe(100);
  });

  it('ignores orphaned status entries in detail card stats', () => {
    const stats = computeDetailsCardStats(plan, {
      'task-1': 'completed',
      'task-2': 'not_started',
      orphaned: 'completed',
    });

    expect(stats.completedTasks).toBe(1);
    expect(stats.totalTasks).toBe(2);
    expect(stats.completionPercentage).toBe(50);
  });
});
