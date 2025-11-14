import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClientPlanDetail } from '@/lib/types/client';
import type { ScheduleJson } from '@/lib/scheduling/types';

// Mock next/navigation useRouter
const pushMock = vi.fn();
vi.mock('next/navigation', async (orig) => {
  const actual = (await orig) as unknown as typeof import('next/navigation');
  return {
    ...actual,
    useRouter: () => ({ push: pushMock }),
  };
});

// Mock child components to simplify the test
vi.mock('@/components/plans/PlanDetailsCard', () => ({
  PlanDetailsCard: () => (
    <div data-testid="plan-details-card">Plan Details</div>
  ),
}));

vi.mock('@/components/plans/PlanModuleCard', () => ({
  PlanModuleCard: ({ module }: { module: { title: string } }) => (
    <div data-testid={`module-${module.title}`}>{module.title}</div>
  ),
}));

vi.mock('@/components/plans/ExportButtons', () => ({
  ExportButtons: () => <div data-testid="export-buttons">Export</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: (props: any) => <button {...props}>{props.children}</button>,
}));

async function renderPlanDetails(
  plan: ClientPlanDetail,
  schedule: ScheduleJson
) {
  (globalThis as any).React = React;
  const { default: PlanDetails } = await import(
    '@/components/plans/PlanDetails'
  );
  return render(<PlanDetails plan={plan} schedule={schedule} />);
}

function createMockPlan(): ClientPlanDetail {
  return {
    id: 'test-plan-id',
    topic: 'Test Learning Topic',
    skillLevel: 'intermediate',
    weeklyHours: 5,
    learningStyle: 'mixed',
    visibility: 'private',
    origin: 'ai',
    status: 'ready',
    modules: [
      {
        id: 'module-1',
        order: 1,
        title: 'Module 1: Introduction',
        description: 'First module',
        estimatedMinutes: 120,
        tasks: [
          {
            id: 'task-1',
            order: 1,
            title: 'Task 1: Basics',
            description: 'Learn the basics',
            estimatedMinutes: 60,
            status: 'not_started',
            resources: [],
          },
        ],
      },
    ],
  };
}

function createMockSchedule(): ScheduleJson {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay()); // Start of week

  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  return {
    weeks: [
      {
        weekNumber: 1,
        startDate: formatDate(weekStart),
        endDate: formatDate(weekEnd),
        days: [
          {
            dayNumber: 1,
            date: formatDate(weekStart),
            sessions: [
              {
                taskId: 'task-1',
                taskTitle: 'Task 1: Basics',
                estimatedMinutes: 60,
                moduleId: 'module-1',
                moduleName: 'Module 1: Introduction',
              },
            ],
          },
        ],
      },
    ],
    totalWeeks: 1,
    totalSessions: 1,
  };
}

describe('Plan Schedule View', () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it('should toggle between modules and schedule view', async () => {
    const plan = createMockPlan();
    const schedule = createMockSchedule();

    await renderPlanDetails(plan, schedule);

    // Verify default view is modules
    expect(
      screen.getByRole('heading', { name: /learning modules/i })
    ).toBeVisible();

    // Click schedule tab
    const scheduleTab = screen.getByRole('tab', { name: /schedule/i });
    fireEvent.click(scheduleTab);

    // Verify schedule view is displayed
    expect(
      screen.getByRole('heading', { name: /learning schedule/i })
    ).toBeVisible();
    expect(screen.getByText(/Week 1/i)).toBeVisible();

    // Click modules tab
    const modulesTab = screen.getByRole('tab', { name: /modules/i });
    fireEvent.click(modulesTab);

    // Verify modules view is restored
    expect(
      screen.getByRole('heading', { name: /learning modules/i })
    ).toBeVisible();
  });

  it('should display week-grouped schedule with dates', async () => {
    const plan = createMockPlan();
    const schedule = createMockSchedule();

    await renderPlanDetails(plan, schedule);

    // Click schedule tab
    const scheduleTab = screen.getByRole('tab', { name: /schedule/i });
    fireEvent.click(scheduleTab);

    // Verify week structure
    expect(screen.getByText(/Week 1/i)).toBeVisible();

    // Verify dates are displayed (format: YYYY-MM-DD)
    const datePattern = /\d{4}-\d{2}-\d{2}/;
    const dateTexts = screen.getAllByText(datePattern);
    expect(dateTexts.length).toBeGreaterThan(0);
    expect(dateTexts[0]).toBeVisible();

    // Verify task time estimates (formatMinutes converts to "X min" or "X hr Y min")
    const timePattern = /\d+\s*(min|hr)/i;
    const timeText = screen.getByText(timePattern);
    expect(timeText).toBeVisible();
  });
});
