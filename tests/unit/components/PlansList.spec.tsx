import { PlansList } from '@/app/plans/components/PlansList';
import type { PlanSummary } from '@/lib/types/db';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

describe('PlansList', () => {
  const mockCompletedPlan: PlanSummary = {
    plan: {
      id: 'plan-1',
      userId: 'user-1',
      topic: 'Learn TypeScript',
      skillLevel: 'intermediate',
      weeklyHours: 10,
      learningStyle: 'mixed',
      startDate: '2024-01-15',
      deadlineDate: '2024-05-15',
      visibility: 'private',
      origin: 'ai',
      generationStatus: 'ready',
      isQuotaEligible: false,
      finalizedAt: new Date('2024-01-15'),
      createdAt: new Date('2024-01-15'),
      updatedAt: new Date('2024-01-15'),
    },
    completion: 1.0,
    completedModules: 4,
    completedTasks: 20,
    totalTasks: 20,
    totalMinutes: 800,
    completedMinutes: 800,
    modules: [
      {
        id: 'mod-1',
        planId: 'plan-1',
        order: 1,
        title: 'Week 1',
        description: 'Module 1',
        estimatedMinutes: 200,
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-15'),
      },
      {
        id: 'mod-2',
        planId: 'plan-1',
        order: 2,
        title: 'Week 2',
        description: 'Module 2',
        estimatedMinutes: 200,
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-15'),
      },
      {
        id: 'mod-3',
        planId: 'plan-1',
        order: 3,
        title: 'Week 3',
        description: 'Module 3',
        estimatedMinutes: 200,
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-15'),
      },
      {
        id: 'mod-4',
        planId: 'plan-1',
        order: 4,
        title: 'Week 4',
        description: 'Module 4',
        estimatedMinutes: 200,
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-15'),
      },
    ],
  };

  const mockActivePlan: PlanSummary = {
    plan: {
      id: 'plan-2',
      userId: 'user-1',
      topic: 'Master React Hooks',
      skillLevel: 'advanced',
      weeklyHours: 5,
      learningStyle: 'practice',
      startDate: '2024-02-01',
      deadlineDate: null,
      visibility: 'private',
      origin: 'ai',
      generationStatus: 'ready',
      isQuotaEligible: true,
      finalizedAt: new Date('2024-02-01'),
      createdAt: new Date('2024-02-01'),
      updatedAt: new Date('2024-02-10'),
    },
    completion: 0.4,
    completedModules: 2,
    completedTasks: 8,
    totalTasks: 20,
    totalMinutes: 600,
    completedMinutes: 240,
    modules: [
      {
        id: 'mod-1',
        planId: 'plan-2',
        order: 1,
        title: 'Week 1',
        description: 'Module 1',
        estimatedMinutes: 100,
        createdAt: new Date('2024-02-01'),
        updatedAt: new Date('2024-02-01'),
      },
      {
        id: 'mod-2',
        planId: 'plan-2',
        order: 2,
        title: 'Week 2',
        description: 'Module 2',
        estimatedMinutes: 100,
        createdAt: new Date('2024-02-01'),
        updatedAt: new Date('2024-02-01'),
      },
      {
        id: 'mod-3',
        planId: 'plan-2',
        order: 3,
        title: 'Week 3',
        description: 'Module 3',
        estimatedMinutes: 100,
        createdAt: new Date('2024-02-01'),
        updatedAt: new Date('2024-02-01'),
      },
      {
        id: 'mod-4',
        planId: 'plan-2',
        order: 4,
        title: 'Week 4',
        description: 'Module 4',
        estimatedMinutes: 100,
        createdAt: new Date('2024-02-01'),
        updatedAt: new Date('2024-02-01'),
      },
      {
        id: 'mod-5',
        planId: 'plan-2',
        order: 5,
        title: 'Week 5',
        description: 'Module 5',
        estimatedMinutes: 100,
        createdAt: new Date('2024-02-01'),
        updatedAt: new Date('2024-02-01'),
      },
      {
        id: 'mod-6',
        planId: 'plan-2',
        order: 6,
        title: 'Week 6',
        description: 'Module 6',
        estimatedMinutes: 100,
        createdAt: new Date('2024-02-01'),
        updatedAt: new Date('2024-02-01'),
      },
    ],
  };

  const mockBeginnerPlan: PlanSummary = {
    plan: {
      id: 'plan-3',
      userId: 'user-1',
      topic: 'Python Basics',
      skillLevel: 'beginner',
      weeklyHours: 3,
      learningStyle: 'reading',
      startDate: null,
      deadlineDate: null,
      visibility: 'private',
      origin: 'ai',
      generationStatus: 'ready',
      isQuotaEligible: false,
      finalizedAt: null,
      createdAt: new Date('2024-03-01'),
      updatedAt: new Date('2024-03-01'),
    },
    completion: 0.0,
    completedModules: 0,
    completedTasks: 0,
    totalTasks: 15,
    totalMinutes: 450,
    completedMinutes: 0,
    modules: [
      {
        id: 'mod-1',
        planId: 'plan-3',
        order: 1,
        title: 'Week 1',
        description: 'Module 1',
        estimatedMinutes: 150,
        createdAt: new Date('2024-03-01'),
        updatedAt: new Date('2024-03-01'),
      },
      {
        id: 'mod-2',
        planId: 'plan-3',
        order: 2,
        title: 'Week 2',
        description: 'Module 2',
        estimatedMinutes: 150,
        createdAt: new Date('2024-03-01'),
        updatedAt: new Date('2024-03-01'),
      },
      {
        id: 'mod-3',
        planId: 'plan-3',
        order: 3,
        title: 'Week 3',
        description: 'Module 3',
        estimatedMinutes: 150,
        createdAt: new Date('2024-03-01'),
        updatedAt: new Date('2024-03-01'),
      },
    ],
  };

  it('should render empty state when no plans provided', () => {
    render(<PlansList summaries={[]} />);

    // EmptyPlansList shows "No Plans Found" title
    expect(screen.getByText('No Plans Found')).toBeInTheDocument();
    expect(
      screen.getByText(/You haven't created any plans yet/i)
    ).toBeInTheDocument();
  });

  it('should render all provided plans', () => {
    render(
      <PlansList
        summaries={[mockCompletedPlan, mockActivePlan, mockBeginnerPlan]}
      />
    );

    expect(screen.getByText('Learn TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Master React Hooks')).toBeInTheDocument();
    expect(screen.getByText('Python Basics')).toBeInTheDocument();
  });

  it('should display correct progress percentage for completed plans', () => {
    render(<PlansList summaries={[mockCompletedPlan]} />);

    // 1.0 * 100 = 100%
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('should display correct progress percentage for active plans', () => {
    render(<PlansList summaries={[mockActivePlan]} />);

    // 0.4 * 100 = 40%
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('should display correct task completion count', () => {
    render(<PlansList summaries={[mockActivePlan]} />);

    // PlanRow shows tasks as X/Y format
    expect(screen.getByText('8/20')).toBeInTheDocument();
  });

  it('should display task completion count for completed plans', () => {
    render(<PlansList summaries={[mockCompletedPlan]} />);

    expect(screen.getByText('20/20')).toBeInTheDocument();
  });

  it('should display 0% for newly started plans', () => {
    render(<PlansList summaries={[mockBeginnerPlan]} />);

    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('should display task count for beginner plan', () => {
    render(<PlansList summaries={[mockBeginnerPlan]} />);

    expect(screen.getByText('0/15')).toBeInTheDocument();
  });

  it('should render correct link for each plan', () => {
    render(<PlansList summaries={[mockCompletedPlan, mockActivePlan]} />);

    const links = screen.getAllByRole('link');
    const planLinks = links.filter(
      (link) => link.getAttribute('href')?.startsWith('/plans/plan-') ?? false
    );
    expect(planLinks).toHaveLength(2);
    expect(planLinks[0]).toHaveAttribute('href', '/plans/plan-1');
    expect(planLinks[1]).toHaveAttribute('href', '/plans/plan-2');
  });

  it('should display "Your Plans" header', () => {
    render(<PlansList summaries={[mockActivePlan]} />);

    expect(screen.getByText('Your Plans')).toBeInTheDocument();
  });

  it('should display plan count in header', () => {
    render(
      <PlansList
        summaries={[mockCompletedPlan, mockActivePlan, mockBeginnerPlan]}
      />
    );

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('should display search input', () => {
    render(<PlansList summaries={[mockActivePlan]} />);

    expect(screen.getByPlaceholderText('Search plans...')).toBeInTheDocument();
  });

  it('should display filter buttons', () => {
    render(<PlansList summaries={[mockActivePlan]} />);

    expect(screen.getByText('All Plans')).toBeInTheDocument();
    expect(screen.getByText(/Active/)).toBeInTheDocument();
    expect(screen.getByText(/Completed/)).toBeInTheDocument();
    expect(screen.getByText(/Inactive/)).toBeInTheDocument();
  });

  it('should display New Plan button', () => {
    render(<PlansList summaries={[mockActivePlan]} />);

    expect(screen.getByText('New Plan')).toBeInTheDocument();
  });

  it('should display view plan buttons', () => {
    render(<PlansList summaries={[mockActivePlan]} />);

    // PlanRow has a "View plan" button
    expect(
      screen.getByRole('button', { name: /view plan/i })
    ).toBeInTheDocument();
  });

  it('should display usage data when provided', () => {
    const mockUsage = {
      tier: 'pro',
      activePlans: { current: 2, limit: 10 },
      regenerations: { used: 1, limit: 5 },
      exports: { used: 0, limit: 20 },
    };

    render(<PlansList summaries={[mockActivePlan]} usage={mockUsage} />);

    // Usage shows "current / limit" format
    expect(screen.getByText('2 / 10')).toBeInTheDocument();
  });

  it('should handle plans with no modules gracefully', () => {
    const emptyModulesPlan: PlanSummary = {
      ...mockActivePlan,
      modules: [],
    };

    render(<PlansList summaries={[emptyModulesPlan]} />);

    // Should still render the plan topic
    expect(screen.getByText('Master React Hooks')).toBeInTheDocument();
  });

  it('should maintain list layout structure', () => {
    const { container } = render(
      <PlansList summaries={[mockCompletedPlan, mockActivePlan]} />
    );

    // New component uses space-y-1 div for list
    const listContainer = container.querySelector('.space-y-1');
    expect(listContainer).toBeInTheDocument();
    expect(listContainer?.children.length).toBe(2);
  });
});
