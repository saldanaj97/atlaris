import { describe, expect, it, vi } from 'vitest';

import {
  buildPlanStartEvent,
  emitModuleSummaries,
} from '@/app/api/v1/plans/stream/helpers';
import type { ParsedModule } from '@/lib/ai/parser';
import type { StreamingEvent } from '@/lib/ai/streaming/types';
import type { CreateLearningPlanInput } from '@/lib/validation/learningPlans';

describe('stream helpers', () => {
  describe('buildPlanStartEvent', () => {
    it('creates plan_start event with all input fields', () => {
      const input: CreateLearningPlanInput = {
        topic: 'TypeScript',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        notes: 'Focus on practical examples',
        startDate: '2024-01-01',
        deadlineDate: '2024-12-31',
        visibility: 'private',
        origin: 'ai',
      };

      const event = buildPlanStartEvent({
        planId: 'plan-123',
        input,
      });

      expect(event.type).toBe('plan_start');
      expect(event.data).toEqual({
        planId: 'plan-123',
        topic: 'TypeScript',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        notes: 'Focus on practical examples',
        startDate: '2024-01-01',
        deadlineDate: '2024-12-31',
        visibility: 'private',
        origin: 'ai',
      });
    });

    it('handles missing optional fields', () => {
      const input: CreateLearningPlanInput = {
        topic: 'JavaScript',
        skillLevel: 'intermediate',
        weeklyHours: 10,
        learningStyle: 'video',
        visibility: 'private',
        origin: 'ai',
      };

      const event = buildPlanStartEvent({
        planId: 'plan-456',
        input,
      });

      expect(event.type).toBe('plan_start');
      expect(event.data.topic).toBe('JavaScript');
      expect(event.data.notes).toBeUndefined();
      expect(event.data.startDate).toBeUndefined();
      expect(event.data.deadlineDate).toBeUndefined();
    });

    it('includes visibility and origin fields', () => {
      const input: CreateLearningPlanInput = {
        topic: 'Python',
        skillLevel: 'advanced',
        weeklyHours: 15,
        learningStyle: 'practice',
        visibility: 'public',
        origin: 'pdf',
      };

      const event = buildPlanStartEvent({
        planId: 'plan-789',
        input,
      });

      expect(event.data.visibility).toBe('public');
      expect(event.data.origin).toBe('pdf');
    });

    it('preserves all skill levels', () => {
      const skillLevels: Array<'beginner' | 'intermediate' | 'advanced'> = [
        'beginner',
        'intermediate',
        'advanced',
      ];

      skillLevels.forEach((skillLevel) => {
        const input: CreateLearningPlanInput = {
          topic: 'Test',
          skillLevel,
          weeklyHours: 5,
          learningStyle: 'mixed',
          visibility: 'private',
          origin: 'ai',
        };

        const event = buildPlanStartEvent({ planId: 'plan-test', input });

        expect(event.data.skillLevel).toBe(skillLevel);
      });
    });

    it('preserves all learning styles', () => {
      const learningStyles: Array<'reading' | 'video' | 'practice' | 'mixed'> = [
        'reading',
        'video',
        'practice',
        'mixed',
      ];

      learningStyles.forEach((learningStyle) => {
        const input: CreateLearningPlanInput = {
          topic: 'Test',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle,
          visibility: 'private',
          origin: 'ai',
        };

        const event = buildPlanStartEvent({ planId: 'plan-test', input });

        expect(event.data.learningStyle).toBe(learningStyle);
      });
    });
  });

  describe('emitModuleSummaries', () => {
    it('emits module_summary and progress events for each module', () => {
      const modules: ParsedModule[] = [
        {
          index: 0,
          title: 'Module 1',
          description: 'First module',
          estimatedMinutes: 120,
          tasks: [
            {
              index: 0,
              title: 'Task 1',
              description: 'First task',
              estimatedMinutes: 60,
              resources: [],
            },
            {
              index: 1,
              title: 'Task 2',
              description: 'Second task',
              estimatedMinutes: 60,
              resources: [],
            },
          ],
        },
        {
          index: 1,
          title: 'Module 2',
          description: 'Second module',
          estimatedMinutes: 90,
          tasks: [
            {
              index: 0,
              title: 'Task 3',
              description: 'Third task',
              estimatedMinutes: 90,
              resources: [],
            },
          ],
        },
      ];

      const emit = vi.fn();

      emitModuleSummaries(modules, 'plan-123', emit);

      // Should emit 2 events per module: module_summary and progress
      expect(emit).toHaveBeenCalledTimes(4);

      // Check first module_summary
      expect(emit).toHaveBeenNthCalledWith(1, {
        type: 'module_summary',
        data: {
          planId: 'plan-123',
          index: 0,
          title: 'Module 1',
          description: 'First module',
          estimatedMinutes: 120,
          tasksCount: 2,
        },
      });

      // Check first progress
      expect(emit).toHaveBeenNthCalledWith(2, {
        type: 'progress',
        data: {
          planId: 'plan-123',
          modulesParsed: 1,
          modulesTotalHint: 2,
        },
      });

      // Check second module_summary
      expect(emit).toHaveBeenNthCalledWith(3, {
        type: 'module_summary',
        data: {
          planId: 'plan-123',
          index: 1,
          title: 'Module 2',
          description: 'Second module',
          estimatedMinutes: 90,
          tasksCount: 1,
        },
      });

      // Check second progress
      expect(emit).toHaveBeenNthCalledWith(4, {
        type: 'progress',
        data: {
          planId: 'plan-123',
          modulesParsed: 2,
          modulesTotalHint: 2,
        },
      });
    });

    it('handles empty modules array', () => {
      const emit = vi.fn();

      emitModuleSummaries([], 'plan-123', emit);

      expect(emit).not.toHaveBeenCalled();
    });

    it('handles single module', () => {
      const modules: ParsedModule[] = [
        {
          index: 0,
          title: 'Single Module',
          description: 'Only module',
          estimatedMinutes: 60,
          tasks: [
            {
              index: 0,
              title: 'Task',
              estimatedMinutes: 60,
              resources: [],
            },
          ],
        },
      ];

      const emit = vi.fn();

      emitModuleSummaries(modules, 'plan-456', emit);

      expect(emit).toHaveBeenCalledTimes(2);
      expect(emit).toHaveBeenNthCalledWith(2, {
        type: 'progress',
        data: {
          planId: 'plan-456',
          modulesParsed: 1,
          modulesTotalHint: 1,
        },
      });
    });

    it('converts undefined description to null', () => {
      const modules: ParsedModule[] = [
        {
          index: 0,
          title: 'Module without description',
          description: undefined,
          estimatedMinutes: 30,
          tasks: [],
        },
      ];

      const emit = vi.fn();

      emitModuleSummaries(modules, 'plan-789', emit);

      const moduleSummaryCall = emit.mock.calls.find(
        (call) => call[0].type === 'module_summary'
      );
      expect(moduleSummaryCall![0].data.description).toBeNull();
    });

    it('preserves module description when present', () => {
      const modules: ParsedModule[] = [
        {
          index: 0,
          title: 'Module with description',
          description: 'This is a detailed description',
          estimatedMinutes: 30,
          tasks: [],
        },
      ];

      const emit = vi.fn();

      emitModuleSummaries(modules, 'plan-abc', emit);

      const moduleSummaryCall = emit.mock.calls.find(
        (call) => call[0].type === 'module_summary'
      );
      expect(moduleSummaryCall![0].data.description).toBe(
        'This is a detailed description'
      );
    });

    it('counts tasks correctly for each module', () => {
      const modules: ParsedModule[] = [
        {
          index: 0,
          title: 'Module 1',
          estimatedMinutes: 150,
          tasks: [{}, {}, {}] as any, // 3 tasks
        },
        {
          index: 1,
          title: 'Module 2',
          estimatedMinutes: 100,
          tasks: [{}, {}, {}, {}, {}] as any, // 5 tasks
        },
        {
          index: 2,
          title: 'Module 3',
          estimatedMinutes: 50,
          tasks: [{}] as any, // 1 task
        },
      ];

      const emit = vi.fn();

      emitModuleSummaries(modules, 'plan-count', emit);

      const summaryEvents = emit.mock.calls
        .map((call) => call[0])
        .filter((event: StreamingEvent) => event.type === 'module_summary');

      expect(summaryEvents[0].data.tasksCount).toBe(3);
      expect(summaryEvents[1].data.tasksCount).toBe(5);
      expect(summaryEvents[2].data.tasksCount).toBe(1);
    });

    it('emits progress with correct incremental counts', () => {
      const modules: ParsedModule[] = [
        { index: 0, title: 'M1', estimatedMinutes: 60, tasks: [] },
        { index: 1, title: 'M2', estimatedMinutes: 60, tasks: [] },
        { index: 2, title: 'M3', estimatedMinutes: 60, tasks: [] },
      ];

      const emit = vi.fn();

      emitModuleSummaries(modules, 'plan-progress', emit);

      const progressEvents = emit.mock.calls
        .map((call) => call[0])
        .filter((event: StreamingEvent) => event.type === 'progress');

      expect(progressEvents[0].data.modulesParsed).toBe(1);
      expect(progressEvents[1].data.modulesParsed).toBe(2);
      expect(progressEvents[2].data.modulesParsed).toBe(3);

      // All should have same total hint
      progressEvents.forEach((event) => {
        expect(event.data.modulesTotalHint).toBe(3);
      });
    });

    it('includes planId in all events', () => {
      const modules: ParsedModule[] = [
        { index: 0, title: 'Module', estimatedMinutes: 60, tasks: [] },
      ];

      const emit = vi.fn();
      const testPlanId = 'test-plan-id-xyz';

      emitModuleSummaries(modules, testPlanId, emit);

      emit.mock.calls.forEach((call) => {
        const event: StreamingEvent = call[0];
        expect(event.data.planId).toBe(testPlanId);
      });
    });

    it('maintains correct event order', () => {
      const modules: ParsedModule[] = [
        { index: 0, title: 'Module 1', estimatedMinutes: 60, tasks: [] },
        { index: 1, title: 'Module 2', estimatedMinutes: 60, tasks: [] },
      ];

      const emit = vi.fn();

      emitModuleSummaries(modules, 'plan-order', emit);

      const eventTypes = emit.mock.calls.map((call) => call[0].type);

      expect(eventTypes).toEqual([
        'module_summary',
        'progress',
        'module_summary',
        'progress',
      ]);
    });

    it('handles modules with zero tasks', () => {
      const modules: ParsedModule[] = [
        {
          index: 0,
          title: 'Empty Module',
          estimatedMinutes: 0,
          tasks: [],
        },
      ];

      const emit = vi.fn();

      emitModuleSummaries(modules, 'plan-empty', emit);

      const moduleSummaryCall = emit.mock.calls.find(
        (call) => call[0].type === 'module_summary'
      );
      expect(moduleSummaryCall![0].data.tasksCount).toBe(0);
    });
  });
});