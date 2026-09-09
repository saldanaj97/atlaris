import type { UsageAnalyticsDayRow } from '@/app/(app)/analytics/usage/usage-analytics-model';
import type { UsageAnalyticsModel } from '@/app/(app)/analytics/usage/usage-analytics-model';

import { UsageAnalyticsContent } from '@/app/(app)/analytics/usage/usage-analytics-content';
import { ROUTES } from '@/features/navigation/routes';
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const dailyTrends: UsageAnalyticsDayRow[] = Array.from(
  { length: 30 },
  (_, index) => ({
    dateKey: `2026-05-${String(index + 1).padStart(2, '0')}`,
    label: `May ${index + 1}`,
    progressChangeCount: index % 4,
    completedEvents: index % 3,
    estimatedCompletionAddedMinutes: (index % 5) * 20,
  }),
);

const model: UsageAnalyticsModel = {
  plans: [
    {
      id: 'plan-1',
      topic: 'Applied TypeScript Architecture',
      weeklyTrends: weeklyTrends.map((week, index) => ({
        ...week,
        progressChangeCount: index % 2,
      })),
    },
    {
      id: 'plan-2',
      topic: 'Database Performance',
      weeklyTrends: weeklyTrends.map((week, index) => ({
        ...week,
        progressChangeCount: index % 2,
      })),
    },
    {
      id: 'plan-3',
      topic: 'Dashboard Activity Polish',
      weeklyTrends: weeklyTrends.map((week, index) => ({
        ...week,
        progressChangeCount: index % 3,
      })),
    },
    {
      id: 'plan-4',
      topic: 'Calendar Sync Hardening',
      weeklyTrends: weeklyTrends.map((week, index) => ({
        ...week,
        progressChangeCount: index === 7 ? 4 : index % 4,
      })),
    },
  ],
  completedTasks: 28,
  totalTasks: 60,
  taskCompletionPercent: 47,
  completedModules: 8,
  totalModules: 18,
  moduleCompletionPercent: 44,
  completedMinutes: 960,
  totalMinutes: 2460,
  plansInProgress: 3,
  planTimeShares: [
    {
      id: 'plan-1',
      topic: 'Applied TypeScript Architecture',
      completedMinutes: 420,
      percent: 44,
    },
    {
      id: 'plan-2',
      topic: 'Database Performance',
      completedMinutes: 240,
      percent: 25,
    },
    {
      id: 'plan-3',
      topic: 'Dashboard Activity Polish',
      completedMinutes: 180,
      percent: 19,
    },
    {
      id: 'plan-4',
      topic: 'Calendar Sync Hardening',
      completedMinutes: 120,
      percent: 13,
    },
  ],
  recentEvents: [
    {
      id: 'event-1',
      planId: 'plan-1',
      planTopic: 'Applied TypeScript Architecture',
      status: 'completed',
      occurredAt: new Date('2026-06-28T16:00:00.000Z'),
    },
    {
      id: 'event-2',
      planId: 'plan-2',
      planTopic: 'Database Performance',
      status: 'in_progress',
      occurredAt: new Date('2026-06-28T12:00:00.000Z'),
    },
  ],
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
    dailyTrends,
    maxWeeklyProgressChanges: 10,
  },
};

describe('UsageAnalyticsContent', () => {
  it('renders the screenshot layout with live summary metrics', () => {
    render(<UsageAnalyticsContent model={model} />);

    expect(
      screen.getByRole('heading', { name: 'Learning analytics' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'A clear view of your progress, habits, and learning journey.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Modules completed')).toBeInTheDocument();
    expect(
      screen.getByText('8 of 18 modules · 28 of 60 tasks'),
    ).toBeInTheDocument();
    expect(screen.getByText('Time spent learning')).toBeInTheDocument();
    expect(screen.getAllByText('16h').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Estimated completed learning time'),
    ).toBeInTheDocument();
    expect(screen.getByText('41h planned total')).toBeInTheDocument();
    expect(screen.getByText('Plans in progress')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Current streak')).toBeInTheDocument();
    expect(screen.getByText('4 days')).toBeInTheDocument();
    expect(screen.getByText('2 days from best')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Learning activity' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Time by plan' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Completed events' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Recent activity' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Completed a task')).toBeInTheDocument();
    expect(screen.getByText('Updated progress')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      ROUTES.DASHBOARD,
    );
    expect(screen.queryByText('vs. previous 30 days')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Full-Stack Web Development'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Executive Review')).not.toBeInTheDocument();
  });

  it('reserves activity chart space while the default time chart loads', () => {
    render(<UsageAnalyticsContent model={model} />);

    expect(
      screen.getByRole('status', { name: 'Loading learning activity chart' }),
    ).toHaveClass('h-64');
  });

  it('switches the activity chart to the eight-week pulse', async () => {
    const user = userEvent.setup();
    render(<UsageAnalyticsContent model={model} />);

    await user.click(
      screen.getByRole('combobox', { name: 'Learning activity metric' }),
    );
    await user.click(screen.getByRole('option', { name: 'By plan' }));

    expect(
      screen.getByText('Progress changes by plan and week.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('eight-week-pulse')).toBeInTheDocument();
    expect(screen.getByTestId('weekly-line-chart')).toBeInTheDocument();
  });

  it('adds plan labels and chart lines as the pulse chart has room for them', async () => {
    const user = userEvent.setup();
    const { container } = render(<UsageAnalyticsContent model={model} />);

    await user.click(
      screen.getByRole('combobox', { name: 'Learning activity metric' }),
    );
    await user.click(screen.getByRole('option', { name: 'By plan' }));
    await resizeChart(380);
    await waitFor(() => {
      expect(
        container.querySelector('.recharts-responsive-container'),
      ).toBeInTheDocument();
    });
    await resizeChart(380);

    const pulse = within(screen.getByTestId('eight-week-pulse'));
    expect(
      pulse.getByText('Applied TypeScript Architecture'),
    ).toBeInTheDocument();
    expect(pulse.getByText('Database Performance')).toBeInTheDocument();
    expect(
      pulse.queryByText('Dashboard Activity Polish'),
    ).not.toBeInTheDocument();
    expect(
      pulse.queryByText('Calendar Sync Hardening'),
    ).not.toBeInTheDocument();
    expect(
      pulse.getByLabelText('2 more plans not shown at this width'),
    ).toHaveTextContent('+2 more');
    await waitFor(() => {
      expect(container.querySelectorAll('.analytics-plan-line')).toHaveLength(
        2,
      );
    });

    await resizeChart(780);

    const widePulse = within(screen.getByTestId('eight-week-pulse'));
    expect(
      widePulse.getByText('Dashboard Activity Polish'),
    ).toBeInTheDocument();
    expect(widePulse.getByText('Calendar Sync Hardening')).toBeInTheDocument();
    expect(widePulse.queryByText('+2 more')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelectorAll('.analytics-plan-line')).toHaveLength(
        4,
      );
    });
  });

  it('caps visible plan series at the five available chart colors', async () => {
    const user = userEvent.setup();
    const sixPlanModel: UsageAnalyticsModel = {
      ...model,
      plans: [
        ...model.plans,
        { ...model.plans[0]!, id: 'plan-5', topic: 'Fifth Plan' },
        { ...model.plans[0]!, id: 'plan-6', topic: 'Sixth Plan' },
      ],
    };
    const { container } = render(
      <UsageAnalyticsContent model={sixPlanModel} />,
    );

    await user.click(
      screen.getByRole('combobox', { name: 'Learning activity metric' }),
    );
    await user.click(screen.getByRole('option', { name: 'By plan' }));
    await resizeChart(1400);

    expect(screen.getByText('Fifth Plan')).toBeInTheDocument();
    expect(screen.queryByText('Sixth Plan')).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('1 more plan not shown at this width'),
    ).toHaveTextContent('+1 more');
    await waitFor(() => {
      expect(container.querySelectorAll('.analytics-plan-line')).toHaveLength(
        5,
      );
    });
  });

  it('switches completed events between cumulative and weekly views', async () => {
    const user = userEvent.setup();
    render(<UsageAnalyticsContent model={model} />);

    expect(
      screen.getByText('Recorded completions over the eight-week pulse.'),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('combobox', { name: 'Completed events chart mode' }),
    );
    await user.click(screen.getByRole('option', { name: 'Weekly' }));

    expect(
      screen.getByRole('combobox', { name: 'Completed events chart mode' }),
    ).toHaveTextContent('Weekly');
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
