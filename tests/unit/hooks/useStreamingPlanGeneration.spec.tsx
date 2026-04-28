import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import { useStreamingPlanGeneration } from '@/hooks/useStreamingPlanGeneration';

const encoder = new TextEncoder();

const toStream = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
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

  it('invokes onPlanIdReady when plan_start arrives before complete', async () => {
    const chunks = [
      'data: {"type":"plan_start","data":{"planId":"plan-early","attemptNumber":1,"topic":"TypeScript","skillLevel":"beginner","learningStyle":"mixed","weeklyHours":5,"startDate":null,"deadlineDate":"2030-01-01"}}\n\n',
      'data: {"type":"complete","data":{"planId":"plan-early","modulesCount":1,"tasksCount":1,"totalMinutes":60}}\n\n',
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(toStream(chunks), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    );

    const { result } = renderHook(() => useStreamingPlanGeneration());

    const readyOrder: string[] = [];
    await act(async () => {
      await result.current.startGeneration(basePayload, {
        onPlanIdReady: (id) => {
          readyOrder.push(`ready:${id}`);
        },
      });
      readyOrder.push('resolved');
    });

    expect(readyOrder).toEqual(['ready:plan-early', 'resolved']);
  });

  it('ignores SSE events emitted after complete', async () => {
    const chunks = [
      'data: {"type":"plan_start","data":{"planId":"plan-late","attemptNumber":1,"topic":"TypeScript","skillLevel":"beginner","learningStyle":"mixed","weeklyHours":5,"startDate":null,"deadlineDate":"2030-01-01"}}\n\n',
      'data: {"type":"module_summary","data":{"planId":"plan-late","index":0,"title":"Only module","description":"Intro","estimatedMinutes":120,"tasksCount":3}}\n\n',
      'data: {"type":"complete","data":{"planId":"plan-late","modulesCount":1,"tasksCount":3,"totalMinutes":120}}\n\n',
      'data: {"type":"module_summary","data":{"planId":"plan-late","index":1,"title":"Should not apply","description":"Late","estimatedMinutes":1,"tasksCount":1}}\n\n',
      'data: {"type":"progress","data":{"planId":"plan-late","modulesParsed":99,"modulesTotalHint":99,"percent":99}}\n\n',
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(toStream(chunks), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    );

    const { result } = renderHook(() => useStreamingPlanGeneration());

    await act(async () => {
      await result.current.startGeneration(basePayload);
    });

    expect(result.current.state.status).toBe('complete');
    expect(result.current.state.modules).toHaveLength(1);
    expect(result.current.state.modules[0]?.title).toBe('Only module');
    expect(result.current.state.progress?.percent).toBeUndefined();
  });

  it('streams events and resolves with plan id', async () => {
    const chunks = [
      'data: {"type":"plan_start","data":{"planId":"plan-1","attemptNumber":1,"topic":"TypeScript","skillLevel":"beginner","learningStyle":"mixed","weeklyHours":5,"startDate":null,"deadlineDate":"2030-01-01"}}\n\n',
      'data: {"type":"module_summary","data":{"planId":"plan-1","index":0,"title":"Module 1","description":"Intro","estimatedMinutes":120,"tasksCount":3}}\n\n',
      'data: {"type":"progress","data":{"planId":"plan-1","modulesParsed":1,"modulesTotalHint":2,"percent":50}}\n\n',
      'data: {"type":"complete","data":{"planId":"plan-1","modulesCount":2,"tasksCount":6,"totalMinutes":240}}\n\n',
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(toStream(chunks), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    );

    const { result } = renderHook(() => useStreamingPlanGeneration());

    let sessionResult:
      | Awaited<ReturnType<typeof result.current.startGeneration>>
      | undefined;
    let notifiedPlanId: string | undefined;
    await act(async () => {
      sessionResult = await result.current.startGeneration(basePayload, {
        onPlanIdReady: (id) => {
          notifiedPlanId = id;
        },
      });
    });

    expect(sessionResult).toEqual({
      status: 'completed',
      planId: 'plan-1',
      result: 'plan-1',
    });
    expect(notifiedPlanId).toBe('plan-1');
    expect(result.current.state.status).toBe('complete');
    expect(result.current.state.modules).toHaveLength(1);
    expect(result.current.state.progress?.modulesParsed).toBe(1);
    expect(result.current.state.progress?.percent).toBe(50);
  });

  it('sets error state on error event', async () => {
    const chunks = [
      'data: {"type":"plan_start","data":{"planId":"plan-err","attemptNumber":1,"topic":"TS","skillLevel":"beginner","learningStyle":"mixed","weeklyHours":5,"startDate":null,"deadlineDate":"2030-01-01"}}\n\n',
      'data: {"type":"error","data":{"planId":"plan-err","code":"VALIDATION_ERROR","message":"boom","classification":"validation","retryable":false}}\n\n',
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(toStream(chunks), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    );

    const { result } = renderHook(() => useStreamingPlanGeneration());

    let notifiedPlanId: string | undefined;
    await act(async () => {
      await expect(
        result.current.startGeneration(basePayload, {
          onPlanIdReady: (id) => {
            notifiedPlanId = id;
          },
        }),
      ).rejects.toThrow('boom');
    });

    expect(notifiedPlanId).toBe('plan-err');
    expect(result.current.state.status).toBe('error');
    expect(result.current.state.error?.classification).toBe('validation');
  });

  it('throws normalized api error for non-streaming failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'Rate limit exceeded. Please wait and retry.',
            code: 'RATE_LIMITED',
          }),
          {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    );

    const { result } = renderHook(() => useStreamingPlanGeneration());

    await act(async () => {
      await expect(
        result.current.startGeneration(basePayload),
      ).rejects.toMatchObject({
        message: 'Rate limit exceeded. Please wait and retry.',
        code: 'RATE_LIMITED',
        status: 429,
      });
    });

    expect(result.current.state.status).toBe('error');
    expect(result.current.state.error).toMatchObject({
      message: 'Rate limit exceeded. Please wait and retry.',
      classification: 'rate_limit',
      retryable: true,
    });
  });

  it('throws a StreamingError for unexpected non-SSE responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>sign-in</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );

    const { result } = renderHook(() => useStreamingPlanGeneration());

    await act(async () => {
      await expect(
        result.current.startGeneration(basePayload),
      ).rejects.toMatchObject({
        message: 'Unexpected server response. Please try again.',
        code: 'INVALID_STREAM_RESPONSE',
        classification: 'provider_error',
        retryable: false,
        status: 200,
      });
    });

    expect(result.current.state.status).toBe('error');
    expect(result.current.state.error).toMatchObject({
      message: 'Unexpected server response. Please try again.',
      classification: 'provider_error',
      retryable: false,
    });
  });
});
