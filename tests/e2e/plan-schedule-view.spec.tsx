import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClientPlanDetail } from '@/lib/types/client';

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
vi.mock('@/app/plans/[id]/components/ExportButtons', () => ({
  ExportButtons: () => <div data-testid="export-buttons">Export</div>,
}));

vi.mock('@/app/plans/[id]/components/PlanPendingState', () => ({
  PlanPendingState: () => (
    <div data-testid="plan-pending-state">Plan is generating...</div>
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: (props: React.ComponentProps<'button'>) => (
    <button {...props}>{props.children}</button>
  ),
}));

async function renderPlanDetails(plan: ClientPlanDetail) {
  (globalThis as any).React = React;
  const { PlanDetails } = await import(
    '@/app/plans/[id]/components/PlanDetails'
  );
  return render(<PlanDetails plan={plan} />);
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
          {
            id: 'task-2',
            order: 2,
            title: 'Task 2: Advanced Basics',
            description: 'More advanced basics',
            estimatedMinutes: 60,
            status: 'completed',
            resources: [],
          },
        ],
      },
      {
        id: 'module-2',
        order: 2,
        title: 'Module 2: Advanced Topics',
        description: 'Second module',
        estimatedMinutes: 180,
        tasks: [
          {
            id: 'task-3',
            order: 1,
            title: 'Task 3: Deep Dive',
            description: 'Deep dive into advanced topics',
            estimatedMinutes: 90,
            status: 'not_started',
            resources: [],
          },
          {
            id: 'task-4',
            order: 2,
            title: 'Task 4: Practice',
            description: 'Practice what you learned',
            estimatedMinutes: 90,
            status: 'not_started',
            resources: [],
          },
        ],
      },
    ],
  };
}

describe('Plan Details View', () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('should display plan topic as heading', async () => {
    const plan = createMockPlan();
    await renderPlanDetails(plan);

    expect(
      screen.getByRole('heading', { name: /Test Learning Topic/i })
    ).toBeInTheDocument();
  });

  it('should display learning modules section', async () => {
    const plan = createMockPlan();
    await renderPlanDetails(plan);

    expect(
      screen.getByRole('heading', { name: /learning modules/i })
    ).toBeInTheDocument();
  });

  it('should display module count', async () => {
    const plan = createMockPlan();
    await renderPlanDetails(plan);

    expect(screen.getByText(/2 modules/i)).toBeInTheDocument();
  });

  it('should display all module titles', async () => {
    const plan = createMockPlan();
    await renderPlanDetails(plan);

    expect(screen.getByText(/Module 1: Introduction/i)).toBeInTheDocument();
    expect(screen.getByText(/Module 2: Advanced Topics/i)).toBeInTheDocument();
  });

  it('should display back to dashboard link', async () => {
    const plan = createMockPlan();
    await renderPlanDetails(plan);

    const backLink = screen.getByRole('link', { name: /back to dashboard/i });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute('href', '/dashboard');
  });

  it('should display export buttons for ready plans', async () => {
    const plan = createMockPlan();
    await renderPlanDetails(plan);

    expect(screen.getByTestId('export-buttons')).toBeInTheDocument();
  });

  it('should display pending state for generating plans', async () => {
    const plan = createMockPlan();
    plan.status = 'pending';
    await renderPlanDetails(plan);

    expect(screen.getByTestId('plan-pending-state')).toBeInTheDocument();
    expect(screen.queryByText(/learning modules/i)).not.toBeInTheDocument();
  });

  it('should display pending state for processing plans', async () => {
    const plan = createMockPlan();
    plan.status = 'processing';
    await renderPlanDetails(plan);

    expect(screen.getByTestId('plan-pending-state')).toBeInTheDocument();
  });

  it('should not show export buttons for pending plans', async () => {
    const plan = createMockPlan();
    plan.status = 'pending';
    await renderPlanDetails(plan);

    expect(screen.queryByTestId('export-buttons')).not.toBeInTheDocument();
  });
});
