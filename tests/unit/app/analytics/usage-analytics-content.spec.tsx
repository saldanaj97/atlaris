import type { UsageAnalyticsModel } from '@/app/(app)/analytics/usage/usage-analytics-model';

import { UsageAnalyticsContent } from '@/app/(app)/analytics/usage/usage-analytics-content';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let observedResizeEntries: {
  element: HTMLElement;
  callback: ResizeObserverCallback;
}[] = [];
let animationFrameCallbacks = new Map<number, FrameRequestCallback>();
let nextAnimationFrameId = 1;

beforeEach(() => {
  observedResizeEntries = [];
  animationFrameCallbacks = new Map();
  nextAnimationFrameId = 1;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextAnimationFrameId;
    nextAnimationFrameId += 1;
    animationFrameCallbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    animationFrameCallbacks.delete(id);
  });

  /** Records observed elements and callbacks for test-controlled resize events. */
  class TestResizeObserver {
    private callback: ResizeObserverCallback;

    /** Stores the callback invoked when observed elements resize. */
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    /** Registers an element for resize notifications in tests. */
    observe(element: Element) {
      observedResizeEntries.push({
        element: element as HTMLElement,
        callback: this.callback,
      });
    }

    unobserve() {}

    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', TestResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const weeks = [
  ['2026-05-04', 'May 4-May 10', 1, 3, 1, 45, false],
  ['2026-05-11', 'May 11-May 17', 2, 5, 2, 90, false],
  ['2026-05-18', 'May 18-May 24', 0, 0, 0, 0, false],
  ['2026-05-25', 'May 25-May 31', 3, 6, 3, 120, false],
  ['2026-06-01', 'Jun 1-Jun 7', 4, 8, 4, 180, false],
  ['2026-06-08', 'Jun 8-Jun 14', 2, 4, 2, 60, false],
  ['2026-06-15', 'Jun 15-Jun 21', 5, 10, 5, 240, false],
  ['2026-06-22', 'Jun 22-Jun 28', 3, 7, 3, 150, true],
] as const;

const weeklyTrends = weeks.map(
  ([
    weekStartDate,
    label,
    activeDays,
    progressChangeCount,
    completedEvents,
    estimatedCompletionAddedMinutes,
    isCurrentWeek,
  ]) => ({
    weekStartDate,
    label,
    activeDays,
    progressChangeCount,
    completedEvents,
    estimatedCompletionAddedMinutes,
    isCurrentWeek,
  }),
);

const model: UsageAnalyticsModel = {
  plans: [
    {
      id: 'plan-1',
      topic: 'Applied TypeScript Architecture',
      completedTasks: 12,
      totalTasks: 20,
      taskCompletionPercent: 60,
      completedModules: 3,
      totalModules: 5,
      completedMinutes: 420,
      totalMinutes: 900,
      currentStreakDays: 4,
      activeDaysThisWeek: 3,
      completedEventsThisWeek: 3,
      estimatedCompletionAddedThisWeek: 150,
      weeklyTrends: weeklyTrends.map((week, index) => ({
        ...week,
        progressChangeCount: index % 2,
      })),
    },
    {
      id: 'plan-2',
      topic: 'Database Performance',
      completedTasks: 7,
      totalTasks: 10,
      taskCompletionPercent: 70,
      completedModules: 2,
      totalModules: 3,
      completedMinutes: 240,
      totalMinutes: 360,
      currentStreakDays: 2,
      activeDaysThisWeek: 2,
      completedEventsThisWeek: 1,
      estimatedCompletionAddedThisWeek: 45,
      weeklyTrends: weeklyTrends.map((week, index) => ({
        ...week,
        progressChangeCount: index % 2,
      })),
    },
    {
      id: 'plan-3',
      topic: 'Dashboard Activity Polish',
      completedTasks: 4,
      totalTasks: 12,
      taskCompletionPercent: 33,
      completedModules: 1,
      totalModules: 4,
      completedMinutes: 120,
      totalMinutes: 480,
      currentStreakDays: 1,
      activeDaysThisWeek: 1,
      completedEventsThisWeek: 1,
      estimatedCompletionAddedThisWeek: 30,
      weeklyTrends: weeklyTrends.map((week, index) => ({
        ...week,
        progressChangeCount: index % 3,
      })),
    },
    {
      id: 'plan-4',
      topic: 'Calendar Sync Hardening',
      completedTasks: 5,
      totalTasks: 18,
      taskCompletionPercent: 28,
      completedModules: 2,
      totalModules: 6,
      completedMinutes: 180,
      totalMinutes: 720,
      currentStreakDays: 3,
      activeDaysThisWeek: 2,
      completedEventsThisWeek: 2,
      estimatedCompletionAddedThisWeek: 60,
      weeklyTrends: weeklyTrends.map((week, index) => ({
        ...week,
        progressChangeCount: index === 7 ? 4 : index % 4,
      })),
    },
  ],
  planCount: 4,
  completedTasks: 28,
  totalTasks: 60,
  taskCompletionPercent: 47,
  completedModules: 8,
  totalModules: 18,
  moduleCompletionPercent: 44,
  completedMinutes: 960,
  totalMinutes: 2460,
  analyticsTimezone: 'America/Chicago',
  history: {
    hasActivity: true,
    currentStreakDays: 4,
    longestStreakDays: 6,
    currentWeek: {
      weekStartDate: '2026-06-22',
      label: 'Jun 22-Jun 28',
      activeDays: 3,
      progressChangeCount: 7,
      completedEvents: 3,
      estimatedCompletionAddedMinutes: 150,
      isCurrentWeek: true,
    },
    weeklyTrends,
    maxWeeklyProgressChanges: 10,
  },
};

describe('UsageAnalyticsContent', () => {
  it('renders the selected trend chart and summary metrics', async () => {
    render(<UsageAnalyticsContent model={model} />);
    await resizeChart(780);

    expect(screen.getByText('Eight-week pulse')).toBeInTheDocument();
    expect(screen.getByText('Progress changes by week')).toBeInTheDocument();
    expect(screen.getByTestId('weekly-line-chart')).toBeInTheDocument();
    expect(
      screen.queryByRole('img', {
        name: 'Progress changes by week for each plan',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Applied TypeScript Architecture'),
    ).toBeInTheDocument();
    expect(screen.getByText('Database Performance')).toBeInTheDocument();
    expect(screen.getByText('Dashboard Activity Polish')).toBeInTheDocument();
    expect(screen.getByText('Calendar Sync Hardening')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Eight-week pulse analytics design'),
    ).toHaveClass('w-full');
    expect(screen.getAllByText('Tasks')).toHaveLength(2);
    expect(screen.getAllByText('47%')).toHaveLength(2);
    expect(screen.getByText('28 / 60 complete')).toBeInTheDocument();
    expect(screen.getByText('32 tasks left')).toBeInTheDocument();
    expect(screen.getAllByText('Modules')).toHaveLength(2);
    expect(screen.getAllByText('44%')).toHaveLength(2);
    expect(screen.getByText('8 / 18 complete')).toBeInTheDocument();
    expect(screen.getByText('10 modules left')).toBeInTheDocument();
    expect(screen.getByText('Completed time')).toBeInTheDocument();
    expect(screen.getAllByText('16 hrs')).toHaveLength(2);
    expect(screen.getByText('41 hrs planned total')).toBeInTheDocument();
    expect(screen.getByText('-1.5 hrs vs last week')).toBeInTheDocument();
    expect(screen.getAllByText('Active days')).toHaveLength(2);
    expect(screen.getAllByText('3/7')).toHaveLength(2);
    expect(screen.getByText('-2 days vs last week')).toBeInTheDocument();
    expect(screen.getByText('Streak')).toBeInTheDocument();
    expect(screen.getByText('4 days')).toBeInTheDocument();
    expect(screen.getByText('Best 6 days')).toBeInTheDocument();
    expect(screen.getByText('2 days from best')).toBeInTheDocument();
    expect(screen.getAllByText('Active')).toHaveLength(2);
    expect(screen.getAllByLabelText('Down')).toHaveLength(4);
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Executive Review')).not.toBeInTheDocument();
    expect(screen.queryByText('Command Board')).not.toBeInTheDocument();
    expect(screen.queryByText('Scoreboard')).not.toBeInTheDocument();
  });

  it('adds plan labels and chart lines as the chart has room for them', async () => {
    const { container } = render(<UsageAnalyticsContent model={model} />);

    await resizeChart(380);
    await waitFor(() => {
      expect(
        container.querySelector('.recharts-responsive-container'),
      ).toBeInTheDocument();
    });
    await resizeChart(380);

    expect(
      screen.getByText('Applied TypeScript Architecture'),
    ).toBeInTheDocument();
    expect(screen.getByText('Database Performance')).toBeInTheDocument();
    expect(
      screen.queryByText('Dashboard Activity Polish'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Calendar Sync Hardening'),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelectorAll('.analytics-plan-line')).toHaveLength(2);
    });
    expect(
      container.querySelector('.recharts-line-dots'),
    ).not.toBeInTheDocument();

    const linePath = await waitFor(() => {
      const renderedLinePath = container.querySelector(
        '.analytics-plan-line .recharts-line-curve',
      );

      expect(renderedLinePath).not.toBeNull();
      return renderedLinePath;
    });
    expect(linePath?.getAttribute('d')).not.toContain('C');

    await resizeChart(780);

    expect(screen.getByText('Dashboard Activity Polish')).toBeInTheDocument();
    expect(screen.getByText('Calendar Sync Hardening')).toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelectorAll('.analytics-plan-line')).toHaveLength(4);
    });
  });
});

/** Simulates a chart container resize and triggers registered ResizeObserver callbacks. */
async function resizeChart(width: number) {
  await waitFor(() => {
    expect(
      observedResizeEntries.some(
        ({ element }) => element.dataset.testid === 'weekly-line-chart',
      ),
    ).toBe(true);
  });

  for (const { element } of observedResizeEntries) {
    Object.defineProperty(element, 'clientWidth', {
      configurable: true,
      value: width,
    });

    Object.defineProperty(element, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 320,
        height: 320,
        left: 0,
        right: width,
        top: 0,
        width,
        x: 0,
        y: 0,
        toJSON: () => {},
      }),
    });
  }

  act(() => {
    for (const { element, callback } of observedResizeEntries) {
      callback(
        [
          {
            target: element,
            contentRect: {
              bottom: 320,
              height: 320,
              left: 0,
              right: width,
              top: 0,
              width,
              x: 0,
              y: 0,
              toJSON: () => {},
            } as DOMRectReadOnly,
          } as unknown as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      );
    }

    for (
      let frame = 0;
      frame < 5 && animationFrameCallbacks.size > 0;
      frame += 1
    ) {
      const callbacks = [...animationFrameCallbacks.values()];
      animationFrameCallbacks.clear();

      for (const callback of callbacks) {
        callback(frame);
      }
    }
  });
}
