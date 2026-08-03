import type { ModuleDetailTask } from '@/features/plans/read-projection/types';

import { ModuleLessonsClient } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleLessonsClient';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createId } from '@tests/fixtures/ids';
import { createDeferredPromise } from '@tests/helpers/deferred-promise';
import { randomUUID } from 'node:crypto';
import { toast } from 'sonner';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const PLAN_ID = randomUUID();
const MODULE_ID = randomUUID();
const OTHER_MODULE_ID = randomUUID();
const GENERATE_URL = `/api/v1/plans/${PLAN_ID}/modules/${MODULE_ID}/lesson-content/generate`;
const STATUS_URL = `/api/v1/plans/${PLAN_ID}/modules/${MODULE_ID}/lesson-content/status`;
const OTHER_STATUS_URL = `/api/v1/plans/${PLAN_ID}/modules/${OTHER_MODULE_ID}/lesson-content/status`;

const refreshMock = vi.fn();
const toastErrorMock = vi.mocked(toast.error);

const generatingLessonGeneration = {
  status: 'generating' as const,
  startedAt: new Date('2025-06-01T00:00:00.000Z'),
  completedAt: null,
  failedAt: null,
  error: null,
};

const statusPollFetchInit = {
  cache: 'no-store' as const,
  signal: expect.any(AbortSignal) as AbortSignal,
};

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

function renderClient(
  options: Partial<
    Pick<
      Parameters<typeof ModuleLessonsClient>[0],
      'previousModulesComplete' | 'lessonGeneration' | 'planId' | 'moduleId'
    >
  > = {},
) {
  return render(
    <ModuleLessonsClient
      planId={options.planId ?? PLAN_ID}
      moduleId={options.moduleId ?? MODULE_ID}
      lessons={[lesson]}
      nextModuleId={null}
      previousModulesComplete={options.previousModulesComplete ?? true}
      statuses={{}}
      onStatusChange={vi.fn()}
      lessonGeneration={
        options.lessonGeneration ?? {
          status: 'not_generated',
          startedAt: null,
          completedAt: null,
          failedAt: null,
          error: null,
        }
      }
    />,
  );
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

  it('calls module generation API and refreshes after ready response', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonFetchResponse({
        state: 'ready',
        planId: PLAN_ID,
        moduleId: MODULE_ID,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderClient();

    await user.click(screen.getByRole('button', { name: 'Generate lessons' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(GENERATE_URL, { method: 'POST' });
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it('renders quota-denied state without refreshing', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonFetchResponse(
          {
            state: 'quota_denied',
            planId: PLAN_ID,
            moduleId: MODULE_ID,
            currentCount: 3,
            limit: 3,
          },
          { ok: false, status: 429 },
        ),
      ),
    );

    renderClient();

    await user.click(screen.getByRole('button', { name: 'Generate lessons' }));

    expect(
      await screen.findByText('Lesson generation quota reached (3/3).'),
    ).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('does not render generation button for locked module', () => {
    renderClient({ previousModulesComplete: false });

    expect(
      screen.getByText('Lesson generation unlocks with this module'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Generate lessons' }),
    ).not.toBeInTheDocument();
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
      lessonGeneration: generatingLessonGeneration,
    });

    expect(screen.getByText('Generating')).toBeInTheDocument();
    expect(screen.getByText('Generating lessons...')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(fetchMock).toHaveBeenCalledWith(STATUS_URL, statusPollFetchInit);
    expect(refreshMock).not.toHaveBeenCalled();
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
      lessonGeneration: generatingLessonGeneration,
    });

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(fetchMock).toHaveBeenCalledWith(STATUS_URL, statusPollFetchInit);
    expect(refreshMock).toHaveBeenCalledTimes(1);

    const callsAfterTerminal = refreshMock.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    expect(refreshMock.mock.calls.length).toBe(callsAfterTerminal);
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
      lessonGeneration: generatingLessonGeneration,
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

  it('shows long-running notice and stops polling after max attempts', async () => {
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
      lessonGeneration: generatingLessonGeneration,
    });

    expect(
      screen.queryByText('Generation taking longer than expected'),
    ).not.toBeInTheDocument();

    for (let i = 0; i < 21; i += 1) {
      await act(async () => {
        vi.advanceTimersByTime(2500);
      });
    }

    expect(
      screen.getByText('Generation taking longer than expected'),
    ).toBeInTheDocument();

    const callsAfterStop = fetchMock.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    expect(fetchMock.mock.calls.length).toBe(callsAfterStop);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('does not refresh from a stale terminal status response after unmount', async () => {
    vi.useFakeTimers();
    const deferred =
      createDeferredPromise<ReturnType<typeof mockJsonFetchResponse>>();
    let fetchSignal: AbortSignal | null = null;
    const fetchMock = vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
      fetchSignal = init?.signal ?? null;
      return deferred.promise;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = renderClient({
      lessonGeneration: generatingLessonGeneration,
    });

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(fetchMock).toHaveBeenCalledWith(STATUS_URL, statusPollFetchInit);
    expect(fetchSignal).not.toBeNull();

    unmount();
    expect((fetchSignal as AbortSignal | null)?.aborted).toBe(true);

    await act(async () => {
      deferred.resolve(
        mockJsonFetchResponse({
          planId: PLAN_ID,
          moduleId: MODULE_ID,
          status: 'ready',
        }),
      );
      await deferred.promise;
    });

    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('does not refresh from a stale terminal status response after module switch', async () => {
    vi.useFakeTimers();
    const deferred =
      createDeferredPromise<ReturnType<typeof mockJsonFetchResponse>>();
    let staleFetchSignal: AbortSignal | null = null;
    const fetchMock = vi.fn((url: string, init?: { signal?: AbortSignal }) => {
      if (url === STATUS_URL) {
        staleFetchSignal = init?.signal ?? null;
        return deferred.promise;
      }

      return Promise.resolve(
        mockJsonFetchResponse({
          planId: PLAN_ID,
          moduleId: OTHER_MODULE_ID,
          status: 'generating',
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = renderClient({
      lessonGeneration: generatingLessonGeneration,
    });

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(staleFetchSignal).not.toBeNull();

    rerender(
      <ModuleLessonsClient
        planId={PLAN_ID}
        moduleId={OTHER_MODULE_ID}
        lessons={[lesson]}
        nextModuleId={null}
        previousModulesComplete={true}
        statuses={{}}
        onStatusChange={vi.fn()}
        lessonGeneration={generatingLessonGeneration}
      />,
    );

    expect((staleFetchSignal as AbortSignal | null)?.aborted).toBe(true);

    await act(async () => {
      deferred.resolve(
        mockJsonFetchResponse({
          planId: PLAN_ID,
          moduleId: MODULE_ID,
          status: 'ready',
        }),
      );
      await deferred.promise;
    });

    expect(refreshMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      OTHER_STATUS_URL,
      statusPollFetchInit,
    );
  });

  it('resets the poll budget when switching to another generating module', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((url: string) => {
      const moduleId = url.includes(OTHER_MODULE_ID)
        ? OTHER_MODULE_ID
        : MODULE_ID;
      return Promise.resolve(
        mockJsonFetchResponse({
          planId: PLAN_ID,
          moduleId,
          status: 'generating',
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = renderClient({
      lessonGeneration: generatingLessonGeneration,
    });

    for (let i = 0; i < 15; i += 1) {
      await act(async () => {
        vi.advanceTimersByTime(2500);
      });
    }

    expect(fetchMock).toHaveBeenCalledTimes(15);

    rerender(
      <ModuleLessonsClient
        planId={PLAN_ID}
        moduleId={OTHER_MODULE_ID}
        lessons={[lesson]}
        nextModuleId={null}
        previousModulesComplete={true}
        statuses={{}}
        onStatusChange={vi.fn()}
        lessonGeneration={generatingLessonGeneration}
      />,
    );

    for (let i = 0; i < 20; i += 1) {
      await act(async () => {
        vi.advanceTimersByTime(2500);
      });
    }

    expect(
      screen.queryByText('Generation taking longer than expected'),
    ).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([url]) => url === OTHER_STATUS_URL),
    ).toHaveLength(20);

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(
      screen.getByText('Generation taking longer than expected'),
    ).toBeInTheDocument();
  });

  it('shows failed generation copy from server and retry affordance', () => {
    renderClient({
      lessonGeneration: {
        status: 'failed',
        startedAt: null,
        completedAt: null,
        failedAt: new Date('2025-06-01T00:00:00.000Z'),
        error: 'Upstream provider timed out.',
      },
    });

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(
      screen.getByText('Upstream provider timed out.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retry lesson generation' }),
    ).toBeInTheDocument();
  });

  it('shows fallback failure hint when server error is empty', () => {
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
      screen.getByText(
        'Generation failed. Retry to create fresh lesson content for this module.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retry lesson generation' }),
    ).toBeInTheDocument();
  });

  it('toasts provider failure and refreshes', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole('button', { name: 'Generate lessons' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Lesson generation failed. Please try again.',
      );
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it('toasts locked response and refreshes stale module state', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole('button', { name: 'Generate lessons' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Complete previous modules before generating lessons.',
      );
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it('toasts disabled response and refreshes', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole('button', { name: 'Generate lessons' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Lesson generation is temporarily unavailable.',
      );
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it('toasts unexpected body on OK response without refreshing', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole('button', { name: 'Generate lessons' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Lesson generation returned unexpected data.',
      );
      expect(refreshMock).not.toHaveBeenCalled();
    });
  });

  it('toasts when JSON parsing fails without refreshing', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
      }),
    );

    renderClient();

    await user.click(screen.getByRole('button', { name: 'Generate lessons' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Lesson generation returned an invalid response.',
      );
      expect(refreshMock).not.toHaveBeenCalled();
    });
  });

  it('toasts when fetch throws and does not refresh', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );

    renderClient();

    await user.click(screen.getByRole('button', { name: 'Generate lessons' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Unable to start lesson generation.',
      );
      expect(refreshMock).not.toHaveBeenCalled();
    });
  });
});
