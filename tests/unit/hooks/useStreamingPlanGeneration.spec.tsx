import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useStreamingPlanGeneration } from '@/hooks/useStreamingPlanGeneration';
import type { CreateLearningPlanInput } from '@/lib/validation/learningPlans';

const encoder = new TextEncoder();

const toStream = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });

const basePayload: CreateLearningPlanInput = {
  topic: 'TypeScript',
  skillLevel: 'beginner',
  weeklyHours: 5,
  learningStyle: 'mixed',
  notes: undefined,
  startDate: undefined,
  visibility: 'private',
  origin: 'ai',
  deadlineDate: '2030-01-01',
};

describe('useStreamingPlanGeneration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('streams events and resolves with plan id', async () => {
    const chunks = [
      'data: {"type":"plan_start","data":{"planId":"plan-1","topic":"TypeScript","skillLevel":"beginner","learningStyle":"mixed","weeklyHours":5,"startDate":null,"deadlineDate":"2030-01-01"}}\n\n',
      'data: {"type":"module_summary","data":{"planId":"plan-1","index":0,"title":"Module 1","description":"Intro","estimatedMinutes":120,"tasksCount":3}}\n\n',
      'data: {"type":"progress","data":{"planId":"plan-1","modulesParsed":1,"modulesTotalHint":2}}\n\n',
      'data: {"type":"complete","data":{"planId":"plan-1","modulesCount":2,"tasksCount":6,"durationMs":1000}}\n\n',
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(toStream(chunks), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      )
    );

    const { result } = renderHook(() => useStreamingPlanGeneration());

    let planId: string | undefined;
    await act(async () => {
      planId = await result.current.startGeneration(basePayload);
    });

    expect(planId).toBe('plan-1');
    expect(result.current.state.status).toBe('complete');
    expect(result.current.state.modules).toHaveLength(1);
    expect(result.current.state.progress?.modulesParsed).toBe(1);
  });

  it('sets error state on error event', async () => {
    const chunks = [
      'data: {"type":"plan_start","data":{"planId":"plan-err","topic":"TS","skillLevel":"beginner","learningStyle":"mixed","weeklyHours":5,"startDate":null,"deadlineDate":"2030-01-01"}}\n\n',
      'data: {"type":"error","data":{"planId":"plan-err","message":"boom","classification":"validation","retryable":false}}\n\n',
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(toStream(chunks), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      )
    );

    const { result } = renderHook(() => useStreamingPlanGeneration());

    await act(async () => {
      await expect(result.current.startGeneration(basePayload)).rejects.toThrow(
        'boom'
      );
    });

    expect(result.current.state.status).toBe('error');
    expect(result.current.state.error?.classification).toBe('validation');
  });
});
