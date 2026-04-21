import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type TaskStatusUpdate,
  useTaskStatusBatcher,
} from '@/hooks/useTaskStatusBatcher';
import type { ProgressStatus } from '@/shared/types/db.types';

const NOT_STARTED: ProgressStatus = 'not_started';
const IN_PROGRESS: ProgressStatus = 'in_progress';
const COMPLETED: ProgressStatus = 'completed';

describe('useTaskStatusBatcher', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('flushes within max wait even when repeated queue activity resets debounce', async () => {
    vi.useFakeTimers();

    const flushAction = vi.fn<(updates: TaskStatusUpdate[]) => Promise<void>>();
    flushAction.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useTaskStatusBatcher({
        flushAction,
        debounceMs: 100,
        maxWaitMs: 250,
      })
    );

    let firstPromise: Promise<void> = Promise.resolve();
    let secondPromise: Promise<void> = Promise.resolve();
    let thirdPromise: Promise<void> = Promise.resolve();

    act(() => {
      firstPromise = result.current.queue('task-1', IN_PROGRESS, NOT_STARTED);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90);
    });

    act(() => {
      secondPromise = result.current.queue('task-1', COMPLETED, NOT_STARTED);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90);
    });

    act(() => {
      thirdPromise = result.current.queue('task-2', COMPLETED, NOT_STARTED);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(69);
    });

    expect(flushAction).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(flushAction).toHaveBeenCalledTimes(1);
    expect(flushAction).toHaveBeenCalledWith([
      { taskId: 'task-1', status: COMPLETED },
      { taskId: 'task-2', status: COMPLETED },
    ]);

    await expect(
      Promise.all([firstPromise, secondPromise, thirdPromise])
    ).resolves.toEqual([undefined, undefined, undefined]);
  });

  it('starts a fresh max-wait window after the previous batch flushes', async () => {
    vi.useFakeTimers();

    const flushAction = vi.fn<(updates: TaskStatusUpdate[]) => Promise<void>>();
    flushAction.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useTaskStatusBatcher({
        flushAction,
        debounceMs: 100,
        maxWaitMs: 250,
      })
    );

    let firstBatchPromise: Promise<void> = Promise.resolve();
    let secondBatchPromise: Promise<void> = Promise.resolve();
    let thirdBatchPromise: Promise<void> = Promise.resolve();
    let nextBatchPromise: Promise<void> = Promise.resolve();

    act(() => {
      firstBatchPromise = result.current.queue(
        'task-1',
        IN_PROGRESS,
        NOT_STARTED
      );
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90);
    });

    act(() => {
      secondBatchPromise = result.current.queue(
        'task-2',
        COMPLETED,
        NOT_STARTED
      );
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90);
    });

    act(() => {
      thirdBatchPromise = result.current.queue(
        'task-3',
        COMPLETED,
        NOT_STARTED
      );
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(70);
    });

    expect(flushAction).toHaveBeenCalledTimes(1);

    await expect(
      Promise.all([firstBatchPromise, secondBatchPromise, thirdBatchPromise])
    ).resolves.toEqual([undefined, undefined, undefined]);

    act(() => {
      nextBatchPromise = result.current.queue('task-4', COMPLETED, NOT_STARTED);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(99);
    });

    expect(flushAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(flushAction).toHaveBeenCalledTimes(2);
    expect(flushAction).toHaveBeenLastCalledWith([
      { taskId: 'task-4', status: COMPLETED },
    ]);

    await expect(nextBatchPromise).resolves.toBeUndefined();
  });
});
