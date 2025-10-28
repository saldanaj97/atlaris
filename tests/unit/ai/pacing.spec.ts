import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeCapacity,
  trimModulesToCapacity,
  pacePlan,
  type PacingParams,
} from '@/lib/ai/pacing';
import type { ParsedModule, ParsedTask } from '@/lib/ai/parser';
import type { GenerationInput } from '@/lib/ai/provider';

describe('pacing module', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2024-01-01T00:00:00Z') });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('computeCapacity', () => {
    const baseParams: PacingParams = {
      weeklyHours: 5,
      skillLevel: 'intermediate',
      deadlineDate: '2024-01-29', // 4 weeks from 2024-01-01
    };

    it('computes capacity for valid inputs', () => {
      const params = { ...baseParams, startDate: '2024-01-01' };
      // 5h/week * 4 weeks * 60 min / 45 min/task = 26.67 → 26
      expect(computeCapacity(params)).toBe(26);
    });

    it('uses today if no startDate', () => {
      const params = { ...baseParams, startDate: null };
      // Uses today 2024-01-01 to 2024-01-29: 4 weeks, same as above
      expect(computeCapacity(params)).toBe(26);
    });

    it('returns 0 for invalid deadline', () => {
      const params = { ...baseParams, deadlineDate: 'invalid' };
      expect(computeCapacity(params)).toBe(0);
    });

    it('returns 0 for zero/negative weeklyHours', () => {
      const params = { ...baseParams, weeklyHours: 0 };
      expect(computeCapacity(params)).toBe(0);
      const paramsNeg = { ...baseParams, weeklyHours: -1 };
      expect(computeCapacity(paramsNeg)).toBe(0);
    });

    it('applies skill level adjustments', () => {
      const paramsBeginner = {
        ...baseParams,
        skillLevel: 'beginner',
        startDate: '2024-01-01',
      };
      // 5*4*60 / 55 ≈ 21.8 → 21
      expect(computeCapacity(paramsBeginner)).toBe(21);

      const paramsAdvanced = {
        ...baseParams,
        skillLevel: 'advanced',
        startDate: '2024-01-01',
      };
      // 5*4*60 / 35 ≈ 34.3 → 34
      expect(computeCapacity(paramsAdvanced)).toBe(34);
    });
  });

  describe('trimModulesToCapacity', () => {
    const mockTask: ParsedTask = {
      title: 'Task 1',
      description: '',
      estimatedMinutes: 30,
    };
    const mockModule: ParsedModule = {
      title: 'Module 1',
      description: '',
      estimatedMinutes: 90,
      tasks: [mockTask],
    };

    it('returns original filtered if capacity >= total tasks (removes empty)', () => {
      const emptyModule: ParsedModule = {
        title: 'Empty',
        description: '',
        estimatedMinutes: 0,
        tasks: [],
      };
      const modules = [emptyModule, mockModule];
      const totalTasks = modules.reduce((sum, m) => sum + m.tasks.length, 0); // 1
      const result = trimModulesToCapacity(modules, totalTasks + 1);
      expect(result).toHaveLength(1); // Filtered empty
      expect(result[0]).toEqual(mockModule);
    });

    it('trims to exactly capacity, preserving order', () => {
      const mockTaskT1 = { ...mockTask, id: 't1' };
      const mockTaskT1b = { ...mockTask, id: 't1b' };
      const mockTaskT2 = { ...mockTask, id: 't2' };
      const modules = [
        { ...mockModule, id: 'mod1', tasks: [mockTaskT1, mockTaskT1b] },
        {
          ...mockModule,
          id: 'mod2',
          tasks: [
            mockTaskT2,
            { ...mockTask, id: 't2b' },
            { ...mockTask, id: 't2c' },
          ],
        },
      ];
      const result = trimModulesToCapacity(modules, 3); // Preselect 2, add 1 more (t1b)
      expect(result).toHaveLength(2);
      expect(result[0].tasks).toEqual([mockTaskT1, mockTaskT1b]);
      expect(result[1].tasks).toEqual([mockTaskT2]);
    });

    it('ensures at least one task per module', () => {
      const mockTaskT1 = { ...mockTask, id: 't1' };
      const mockTaskT2 = { ...mockTask, id: 't2' };
      const mockTaskT2b = { ...mockTask, id: 't2b' };
      const modules = [
        { ...mockModule, id: 'mod1', tasks: [mockTaskT1] },
        { ...mockModule, id: 'mod2', tasks: [mockTaskT2, mockTaskT2b] },
      ];
      const result = trimModulesToCapacity(modules, 2); // Capacity = num modules
      expect(result).toHaveLength(2);
      expect(result[0].tasks.length).toBe(1);
      expect(result[1].tasks.length).toBe(1);
    });

    it('omits modules with no tasks', () => {
      const emptyModule: ParsedModule = {
        title: 'Empty',
        description: '',
        estimatedMinutes: 0,
        tasks: [],
      };
      const fullModule = {
        ...mockModule,
        tasks: [{ ...mockTask }],
      };
      const modules = [emptyModule, fullModule];
      const result = trimModulesToCapacity(modules, 1);
      expect(result).toHaveLength(1);
      expect(result[0].tasks.length).toBe(1);
    });

    it('handles capacity <= 0 by returning empty array', () => {
      const modules = [mockModule];
      expect(trimModulesToCapacity(modules, 0)).toEqual([]);
      expect(trimModulesToCapacity(modules, -1)).toEqual([]);
    });

    it('preselects only when capacity covers preselections', () => {
      const mockTaskT10 = { ...mockTask };
      const mockTaskT11 = { ...mockTask };
      const mockTaskT12 = { ...mockTask };
      const mockTaskT20 = { ...mockTask };
      const mockTaskT21 = { ...mockTask };
      const modules = [
        {
          ...mockModule,
          tasks: [mockTaskT10, mockTaskT11, mockTaskT12],
        },
        { ...mockModule, tasks: [mockTaskT20, mockTaskT21] },
      ];
      const result = trimModulesToCapacity(modules, 2); // Exactly preselections
      expect(result[0].tasks.length).toBe(1);
      expect(result[1].tasks.length).toBe(1);
    });
  });

  describe('pacePlan', () => {
    const mockInput: GenerationInput = {
      topic: 'test',
      learningStyle: 'visual',
      skillLevel: 'intermediate',
      weeklyHours: 5,
      startDate: '2024-01-01',
      deadlineDate: '2024-01-29',
      // Other fields omitted
    };

    it('trims modules using computed capacity', () => {
      const mockTaskBase: ParsedTask = {
        title: 'Task',
        description: '',
        estimatedMinutes: 45,
      };
      const modules: ParsedModule[] = [
        {
          title: 'Mod 1',
          description: '',
          estimatedMinutes: 90,
          tasks: Array(10)
            .fill(mockTaskBase)
            .map((t) => ({ ...t })),
        },
        {
          title: 'Mod 2',
          description: '',
          estimatedMinutes: 90,
          tasks: Array(10)
            .fill(mockTaskBase)
            .map((t) => ({ ...t })),
        },
      ];
      // Expected capacity 26 >=20, return original (no empty)
      const result = pacePlan(modules, mockInput);
      expect(result).toEqual(modules); // Capacity sufficient

      // Low capacity test: 1h/week, 1 week
      const lowInput = {
        ...mockInput,
        weeklyHours: 1,
        deadlineDate: '2024-01-08',
      };
      const lowResult = pacePlan(modules, lowInput);
      // Capacity floor(1*1*60/45)=1, effective=1 <20, preselect 2 >1, so trim to first task each module, total 2
      const totalTasks = lowResult.reduce((sum, m) => sum + m.tasks.length, 0);
      expect(totalTasks).toBe(2);
    });

    it('uses effectiveCapacity fallback for low/zero capacity', () => {
      const mockTaskT1: ParsedTask = {
        title: 'Task 1',
        description: '',
        estimatedMinutes: 30,
      };
      const modules = [
        {
          title: 'Mod 1',
          description: '',
          estimatedMinutes: 90,
          tasks: [mockTaskT1],
        },
      ];
      const lowInput: GenerationInput = {
        ...mockInput,
        weeklyHours: 0,
        deadlineDate: 'invalid',
      }; // Capacity 0
      const result = pacePlan(modules, lowInput);
      expect(result).toHaveLength(1);
      expect(result[0].tasks.length).toBe(1); // Minimal: 1 per module
    });

    it('handles modules with no tasks', () => {
      const modules: ParsedModule[] = [
        {
          title: 'Mod 1',
          description: '',
          estimatedMinutes: 90,
          tasks: [],
        },
      ];
      const result = pacePlan(modules, mockInput);
      expect(result).toHaveLength(0); // Omitted as empty
    });
  });
});
