import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';

import { usePlanGenerationSession } from '@/features/plans/session/usePlanGenerationSession';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(response: Response | Promise<Response>) {
  const fetchMock = vi.fn().mockReturnValue(Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('usePlanGenerationSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs the create body to /api/v1/plans and resolves on 202 with both IDs', async () => {
    const fetchMock = stubFetch(
      jsonResponse({ planId: 'plan-1', attemptId: 'attempt-1' }, 202),
    );
    const { result } = renderHook(() => usePlanGenerationSession());

    const order: string[] = [];
    let sessionResult: unknown;
    await act(async () => {
      sessionResult = await result.current.startSession(
        { kind: 'create', input: basePayload },
        { onPlanIdReady: (id) => order.push(`ready:${id}`) },
      );
      order.push('resolved');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/plans',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(basePayload),
        credentials: 'include',
      }),
    );
    expect(sessionResult).toEqual({
      status: 'started',
      planId: 'plan-1',
      attemptId: 'attempt-1',
    });
    expect(order).toEqual(['ready:plan-1', 'resolved']);
    expect(result.current.state).toEqual({
      status: 'started',
      planId: 'plan-1',
      attemptId: 'attempt-1',
    });
  });

  it('POSTs a retry without a body to /api/v1/plans/:planId/retry', async () => {
    const fetchMock = stubFetch(
      jsonResponse({ planId: 'plan-9', attemptId: 'attempt-2' }, 202),
    );
    const { result } = renderHook(() => usePlanGenerationSession());

    await act(async () => {
      await result.current.startSession({ kind: 'retry', planId: 'plan-9' });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/plans/plan-9/retry',
      expect.objectContaining({ method: 'POST', body: undefined }),
    );
    expect(result.current.state.status).toBe('started');
  });

  it('reports starting while the request is in flight', async () => {
    let respond: (response: Response) => void = () => {};
    stubFetch(
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
    );
    const { result } = renderHook(() => usePlanGenerationSession());

    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.startSession({
        kind: 'retry',
        planId: 'plan-9',
      });
    });
    expect(result.current.state.status).toBe('starting');

    await act(async () => {
      respond(jsonResponse({ planId: 'plan-9', attemptId: 'attempt-2' }, 202));
      await pending;
    });
    expect(result.current.state.status).toBe('started');
  });

  it('keeps the plan ID from a not-started error so the caller can open the plan', async () => {
    stubFetch(
      jsonResponse(
        {
          error: 'Plan generation encountered an error. Please try again.',
          code: 'GENERATION_FAILED',
          classification: 'provider_error',
          details: { planId: 'plan-err', retryable: true },
        },
        503,
      ),
    );
    const onPlanIdReady = vi.fn();
    const { result } = renderHook(() => usePlanGenerationSession());

    await act(async () => {
      await expect(
        result.current.startSession(
          { kind: 'create', input: basePayload },
          { onPlanIdReady },
        ),
      ).rejects.toMatchObject({
        message: 'Plan generation encountered an error. Please try again.',
        code: 'GENERATION_FAILED',
        status: 503,
        planId: 'plan-err',
        classification: 'provider_error',
        retryable: true,
      });
    });

    expect(onPlanIdReady).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({
      status: 'error',
      planId: 'plan-err',
      error: {
        message: 'Plan generation encountered an error. Please try again.',
        classification: 'provider_error',
        retryable: true,
      },
    });
  });

  it('throws the normalized API error for pre-generation failures', async () => {
    stubFetch(
      jsonResponse(
        {
          error: 'Rate limit exceeded. Please wait and retry.',
          code: 'RATE_LIMITED',
        },
        429,
      ),
    );
    const { result } = renderHook(() => usePlanGenerationSession());

    await act(async () => {
      await expect(
        result.current.startSession({ kind: 'create', input: basePayload }),
      ).rejects.toMatchObject({
        message: 'Rate limit exceeded. Please wait and retry.',
        code: 'RATE_LIMITED',
        status: 429,
        planId: undefined,
      });
    });

    expect(result.current.state.status).toBe('error');
    expect(result.current.state.error).toMatchObject({
      message: 'Rate limit exceeded. Please wait and retry.',
      classification: 'rate_limit',
      retryable: true,
    });
  });

  it('uses the retry fallback message when the error body has none', async () => {
    stubFetch(new Response('', { status: 500 }));
    const { result } = renderHook(() => usePlanGenerationSession());

    await act(async () => {
      await expect(
        result.current.startSession({ kind: 'retry', planId: 'plan-9' }),
      ).rejects.toMatchObject({ message: 'Failed to retry generation.' });
    });
  });

  it('treats a redirect to a non-JSON page as sign-in required', async () => {
    const response = new Response('<html>sign-in</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
    Object.defineProperty(response, 'redirected', { value: true });
    stubFetch(response);
    const { result } = renderHook(() => usePlanGenerationSession());

    await act(async () => {
      await expect(
        result.current.startSession({ kind: 'create', input: basePayload }),
      ).rejects.toMatchObject({
        code: 'AUTH_REQUIRED',
        classification: 'auth_required',
        retryable: false,
      });
    });

    expect(result.current.state.error?.classification).toBe('auth_required');
  });

  it.each([
    ['a non-JSON body', new Response('<html>oops</html>', { status: 200 })],
    ['a 2xx body without IDs', jsonResponse({ accepted: true }, 202)],
  ])('rejects %s as an unexpected response', async (_label, response) => {
    stubFetch(response);
    const { result } = renderHook(() => usePlanGenerationSession());

    await act(async () => {
      await expect(
        result.current.startSession({ kind: 'create', input: basePayload }),
      ).rejects.toMatchObject({
        message: 'Unexpected server response. Please try again.',
        code: 'INVALID_START_RESPONSE',
        classification: 'provider_error',
        retryable: false,
      });
    });

    expect(result.current.state.status).toBe('error');
  });

  it('resolves as cancelled when the request is aborted', async () => {
    stubFetch(Promise.reject(new DOMException('Aborted', 'AbortError')));
    const { result } = renderHook(() => usePlanGenerationSession());

    let sessionResult: unknown;
    await act(async () => {
      sessionResult = await result.current.startSession({
        kind: 'retry',
        planId: 'plan-9',
      });
    });

    expect(sessionResult).toEqual({ status: 'cancelled', planId: 'plan-9' });
    expect(result.current.state.status).toBe('cancelled');
  });

  it('sets a retryable error state when the network request fails', async () => {
    stubFetch(Promise.reject(new TypeError('Failed to fetch')));
    const { result } = renderHook(() => usePlanGenerationSession());

    await act(async () => {
      await expect(
        result.current.startSession({ kind: 'create', input: basePayload }),
      ).rejects.toThrow('Failed to fetch');
    });

    expect(result.current.state.error).toEqual({
      message: 'Unable to start plan generation. Please try again.',
      classification: 'provider_error',
      retryable: true,
    });
  });
});
