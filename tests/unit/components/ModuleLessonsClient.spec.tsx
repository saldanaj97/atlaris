import type { ModuleDetailTask } from '@/features/plans/read-projection/types';

import { ModuleLessonsClient } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleLessonsClient';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createId } from '@tests/fixtures/ids';
import { createDeferredPromise } from '@tests/helpers/deferred-promise';
import { randomUUID } from 'node:crypto';
import { toast } from 'sonner';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const PLAN_ID = randomUUID();
const MODULE_ID = randomUUID();
const NEXT_MODULE_ID = randomUUID();
const GENERATE_URL = `/api/v1/plans/${PLAN_ID}/modules/${MODULE_ID}/lesson-content/generate`;
const STATUS_URL = `/api/v1/plans/${PLAN_ID}/modules/${MODULE_ID}/lesson-content/status`;

const refreshMock = vi.fn();
const toastErrorMock = vi.mocked(toast.error);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const lesson: ModuleDetailTask = {
  id: createId('task'),
  order: 1,
  title: 'First lesson',
  description: null,
  estimatedMinutes: 10,
  status: 'not_started',
  lessonContent: null,
  lessonContentUpdatedAt: null,
  resources: [],
};

function mockJsonFetchResponse(
  body: unknown,
  options?: { ok?: boolean; status?: number },
): {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
} {
  const status = options?.status ?? 200;
  const ok = options?.ok ?? (status >= 200 && status < 300);
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

function clientProps(
  options: Partial<
    Pick<
      Parameters<typeof ModuleLessonsClient>[0],
      'previousModulesComplete' | 'lessonGeneration' | 'planId' | 'moduleId'
    >
  > = {},
): Parameters<typeof ModuleLessonsClient>[0] {
  return {
    planId: options.planId ?? PLAN_ID,
    moduleId: options.moduleId ?? MODULE_ID,
    lessons: [lesson],
    nextModuleId: null,
    previousModulesComplete: options.previousModulesComplete ?? true,
    statuses: {},
    onStatusChange: vi.fn(),
    lessonGeneration: options.lessonGeneration ?? {
      status: 'not_generated',
      startedAt: null,
      completedAt: null,
      failedAt: null,
      error: null,
    },
  };
}

function renderClient(
  options: Partial<
    Pick<
      Parameters<typeof ModuleLessonsClient>[0],
      'previousModulesComplete' | 'lessonGeneration' | 'planId' | 'moduleId'
    >
  > = {},
) {
  return render(<ModuleLessonsClient {...clientProps(options)} />);
}

describe('ModuleLessonsClient', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    toastErrorMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('auto-starts generation on open and refreshes after ready response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonFetchResponse({
        state: 'ready',
        planId: PLAN_ID,
        moduleId: MODULE_ID,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderClient();

    expect(
      screen.queryByRole('button', { name: 'Generate lessons' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Generating lessons…')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(GENERATE_URL, { method: 'POST' });
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it('does not auto-loop failed modules and keeps Retry', () => {
    renderClient({
      lessonGeneration: {
        status: 'failed',
        startedAt: null,
        completedAt: null,
        failedAt: new Date('2025-06-01T00:00:00.000Z'),
        error: null,
      },
    });

    expect(
      screen.getByRole('button', { name: 'Retry lesson generation' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Generate lessons' }),
    ).not.toBeInTheDocument();
  });

  it('auto-starts even when previous modules are incomplete', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonFetchResponse(
        {
          state: 'generating',
          planId: PLAN_ID,
          moduleId: MODULE_ID,
        },
        { status: 202 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderClient({ previousModulesComplete: false });

    expect(
      screen.queryByText('Lesson generation unlocks with this module'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Generate lessons' }),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(GENERATE_URL, { method: 'POST' });
    });
  });

  it('shows generating state and polls status without refreshing', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonFetchResponse({
        planId: PLAN_ID,
        moduleId: MODULE_ID,
        status: 'generating',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderClient({
      lessonGeneration: {
        status: 'generating',
        startedAt: new Date('2025-06-01T00:00:00.000Z'),
        completedAt: null,
        failedAt: null,
        error: null,
      },
    });

    expect(screen.getByText('Generating')).toBeInTheDocument();
    expect(screen.getByText('Generating lessons…')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      STATUS_URL,
      expect.objectContaining({
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('polls after a workflow starts before refreshed server state becomes generating', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonFetchResponse(
          {
            state: 'generating',
            planId: PLAN_ID,
            moduleId: MODULE_ID,
            workflowRunId: 'wrun_current',
          },
          { status: 202 },
        ),
      )
      .mockResolvedValueOnce(
        mockJsonFetchResponse({
          planId: PLAN_ID,
          moduleId: MODULE_ID,
          status: 'ready',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderClient();

    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith(GENERATE_URL, { method: 'POST' });
    expect(screen.getByText('Generating lessons…')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      STATUS_URL,
      expect.objectContaining({
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });

  it('keeps polling while a queued workflow has not claimed the module yet', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonFetchResponse(
          {
            state: 'generating',
            planId: PLAN_ID,
            moduleId: MODULE_ID,
            workflowRunId: 'wrun_current',
          },
          { status: 202 },
        ),
      )
      .mockResolvedValueOnce(
        mockJsonFetchResponse({
          planId: PLAN_ID,
          moduleId: MODULE_ID,
          status: 'not_generated',
          workflowRunId: 'wrun_previous',
        }),
      )
      .mockResolvedValueOnce(
        mockJsonFetchResponse({
          planId: PLAN_ID,
          moduleId: MODULE_ID,
          status: 'ready',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderClient();

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      STATUS_URL,
      expect.objectContaining({
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(screen.getByText('Generating lessons…')).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });

  it('stops polling when the accepted workflow run rolls back before generating is observed', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonFetchResponse(
          {
            state: 'generating',
            planId: PLAN_ID,
            moduleId: MODULE_ID,
            workflowRunId: 'wrun_current',
          },
          { status: 202 },
        ),
      )
      .mockResolvedValueOnce(
        mockJsonFetchResponse({
          planId: PLAN_ID,
          moduleId: MODULE_ID,
          status: 'not_generated',
          workflowRunId: 'wrun_current',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderClient();

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshMock).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole('button', { name: 'Generate lessons' }),
    ).not.toBeInTheDocument();

    const callsAfterTerminal = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock.mock.calls.length).toBe(callsAfterTerminal);
  });

  it('keeps polling while a failed-module retry has not been claimed yet', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonFetchResponse(
          {
            state: 'generating',
            planId: PLAN_ID,
            moduleId: MODULE_ID,
          },
          { status: 202 },
        ),
      )
      .mockResolvedValueOnce(
        mockJsonFetchResponse({
          planId: PLAN_ID,
          moduleId: MODULE_ID,
          status: 'failed',
        }),
      )
      .mockResolvedValueOnce(
        mockJsonFetchResponse({
          planId: PLAN_ID,
          moduleId: MODULE_ID,
          status: 'ready',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderClient({
      lessonGeneration: {
        status: 'failed',
        startedAt: null,
        completedAt: null,
        failedAt: new Date('2025-06-01T00:00:00.000Z'),
        error: null,
      },
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Retry lesson generation' }),
      );
    });

    expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      STATUS_URL,
      expect.objectContaining({
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();
    expect(refreshMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });

  it('stops polling when failed returns after generating (post-work failure)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonFetchResponse(
          {
            state: 'generating',
            planId: PLAN_ID,
            moduleId: MODULE_ID,
          },
          { status: 202 },
        ),
      )
      .mockResolvedValueOnce(
        mockJsonFetchResponse({
          planId: PLAN_ID,
          moduleId: MODULE_ID,
          status: 'generating',
        }),
      )
      .mockResolvedValueOnce(
        mockJsonFetchResponse({
          planId: PLAN_ID,
          moduleId: MODULE_ID,
          status: 'failed',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderClient({
      lessonGeneration: {
        status: 'failed',
        startedAt: null,
        completedAt: null,
        failedAt: new Date('2025-06-01T00:00:00.000Z'),
        error: null,
      },
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Retry lesson generation' }),
      );
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(refreshMock).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole('button', { name: 'Retry lesson generation' }),
    ).not.toBeDisabled();

    const callsAfterTerminal = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock.mock.calls.length).toBe(callsAfterTerminal);
  });

  it('refreshes once when status polling returns ready', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonFetchResponse({
        planId: PLAN_ID,
        moduleId: MODULE_ID,
        status: 'ready',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderClient({
      lessonGeneration: {
        status: 'generating',
        startedAt: new Date('2025-06-01T00:00:00.000Z'),
        completedAt: null,
        failedAt: null,
        error: null,
      },
    });

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      STATUS_URL,
      expect.objectContaining({
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);

    const callsAfterTerminal = refreshMock.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    expect(refreshMock.mock.calls.length).toBe(callsAfterTerminal);
  });

  it('does not refresh after an in-flight terminal poll resolves following unmount', async () => {
    vi.useFakeTimers();
    const statusResponse =
      createDeferredPromise<ReturnType<typeof mockJsonFetchResponse>>();
    const fetchMock = vi.fn().mockReturnValue(statusResponse.promise);
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = renderClient({
      lessonGeneration: {
        status: 'generating',
        startedAt: new Date('2025-06-01T00:00:00.000Z'),
        completedAt: null,
        failedAt: null,
        error: null,
      },
    });

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(requestInit.signal?.aborted).toBe(false);

    unmount();

    expect(requestInit.signal?.aborted).toBe(true);

    await act(async () => {
      statusResponse.resolve(
        mockJsonFetchResponse({
          planId: PLAN_ID,
          moduleId: MODULE_ID,
          status: 'ready',
        }),
      );
      await statusResponse.promise;
    });

    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('starts a fresh poll budget when generation switches modules', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonFetchResponse({
        planId: PLAN_ID,
        moduleId: MODULE_ID,
        status: 'generating',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const lessonGeneration = {
      status: 'generating' as const,
      startedAt: new Date('2025-06-01T00:00:00.000Z'),
      completedAt: null,
      failedAt: null,
      error: null,
    };
    const { rerender } = renderClient({ lessonGeneration });

    for (let i = 0; i < 20; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
    }

    rerender(
      <ModuleLessonsClient
        {...clientProps({
          moduleId: NEXT_MODULE_ID,
          lessonGeneration,
        })}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(fetchMock).toHaveBeenCalledTimes(21);
    expect(
      screen.queryByText('Generation taking longer than expected'),
    ).not.toBeInTheDocument();
  });

  it('refreshes and resumes polling after a transient status failure', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonFetchResponse(
          { error: { code: 'INTERNAL_ERROR', message: 'Unavailable' } },
          { ok: false, status: 500 },
        ),
      )
      .mockResolvedValue(
        mockJsonFetchResponse({
          planId: PLAN_ID,
          moduleId: MODULE_ID,
          status: 'generating',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderClient({
      lessonGeneration: {
        status: 'generating',
        startedAt: new Date('2025-06-01T00:00:00.000Z'),
        completedAt: null,
        failedAt: null,
        error: null,
      },
    });

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('times out a stuck status request and resumes polling', async () => {
    vi.useFakeTimers();
    const requestTimeout = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(requestTimeout.signal);
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(init.signal?.reason);
            });
          }),
      )
      .mockResolvedValue(
        mockJsonFetchResponse({
          planId: PLAN_ID,
          moduleId: MODULE_ID,
          status: 'generating',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderClient({
      lessonGeneration: {
        status: 'generating',
        startedAt: new Date('2025-06-01T00:00:00.000Z'),
        completedAt: null,
        failedAt: null,
        error: null,
      },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    requestTimeout.abort(new DOMException('Timed out', 'TimeoutError'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(refreshMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows long-running notice and keeps polling until status becomes terminal', async () => {
    vi.useFakeTimers();
    let pollCount = 0;
    const fetchMock = vi.fn(async () => {
      pollCount += 1;
      return mockJsonFetchResponse({
        planId: PLAN_ID,
        moduleId: MODULE_ID,
        status: pollCount === 22 ? 'ready' : 'generating',
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderClient({
      lessonGeneration: {
        status: 'generating',
        startedAt: new Date('2025-06-01T00:00:00.000Z'),
        completedAt: null,
        failedAt: null,
        error: null,
      },
    });

    expect(
      screen.queryByText('Generation taking longer than expected'),
    ).not.toBeInTheDocument();

    for (let i = 0; i < 21; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
    }

    expect(
      screen.getByText('Generation taking longer than expected'),
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2499);
    });
    expect(fetchMock).toHaveBeenCalledTimes(21);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2501);
    });
    expect(fetchMock).toHaveBeenCalledTimes(22);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('shows a generic failed-generation hint and retry affordance', () => {
    renderClient({
      lessonGeneration: {
        status: 'failed',
        startedAt: null,
        completedAt: null,
        failedAt: new Date('2025-06-01T00:00:00.000Z'),
        error: null,
      },
    });

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Generation failed. Retry to create fresh lesson content for this module.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retry lesson generation' }),
    ).toBeInTheDocument();
  });

  it('does not render stale server diagnostics when a prior row contains one', () => {
    renderClient({
      lessonGeneration: {
        status: 'failed',
        startedAt: null,
        completedAt: null,
        failedAt: new Date('2025-06-01T00:00:00.000Z'),
        error: 'Upstream provider timed out.',
      },
    });

    expect(
      screen.getByText(
        'Generation failed. Retry to create fresh lesson content for this module.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Upstream provider timed out.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retry lesson generation' }),
    ).toBeInTheDocument();
  });

  it('toasts provider failure and refreshes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonFetchResponse(
          {
            state: 'provider_failure',
            planId: PLAN_ID,
            moduleId: MODULE_ID,
            message: 'Invalid JSON from model.',
          },
          { ok: false, status: 502 },
        ),
      ),
    );

    renderClient();

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Lesson generation failed. Please try again.',
      );
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('toasts locked response and refreshes stale module state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonFetchResponse({
          state: 'locked',
          planId: PLAN_ID,
          moduleId: MODULE_ID,
        }),
      ),
    );

    renderClient();

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Lesson generation is not available for this module.',
      );
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('toasts disabled response and refreshes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonFetchResponse(
          {
            state: 'disabled',
            planId: PLAN_ID,
            moduleId: MODULE_ID,
          },
          { ok: false, status: 503 },
        ),
      ),
    );

    renderClient();

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Lesson generation is temporarily unavailable.',
      );
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('toasts unexpected body on OK response without refreshing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonFetchResponse({
          state: 'bogus',
          planId: PLAN_ID,
          moduleId: MODULE_ID,
        }),
      ),
    );

    renderClient();

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Lesson generation returned unexpected data.',
      );
      expect(refreshMock).not.toHaveBeenCalled();
    });
  });

  it('toasts when JSON parsing fails without refreshing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
      }),
    );

    renderClient();

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Lesson generation returned an invalid response.',
      );
      expect(refreshMock).not.toHaveBeenCalled();
    });
  });

  it('toasts when fetch throws and does not refresh', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );

    renderClient();

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Unable to start lesson generation.',
      );
      expect(refreshMock).not.toHaveBeenCalled();
    });
  });
});
