import PlansList from '@/app/plans/components/PlansList';
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
    const { container } = render(<PlansList summaries={[]} />);
    expect(container.querySelector('.grid')).toBeInTheDocument();
    expect(container.querySelector('.grid')?.children.length).toBe(0);
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

  it('should display completed badge for 100% completed plans', () => {
    render(<PlansList summaries={[mockCompletedPlan]} />);

    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  it('should display active badge for incomplete plans', () => {
    render(<PlansList summaries={[mockActivePlan]} />);

    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('should display correct progress percentage', () => {
    render(<PlansList summaries={[mockActivePlan]} />);

    // 0.4 * 100 = 40%
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('should display correct week progress', () => {
    render(<PlansList summaries={[mockActivePlan]} />);

    // completedModules: 2, modules.length: 6, so current week is 3
    expect(screen.getByText(/Week 3 of 6/i)).toBeInTheDocument();
  });

  it('should display correct task completion stats', () => {
    render(<PlansList summaries={[mockActivePlan]} />);

    expect(screen.getByText(/Completed tasks: 8 \/ 20/i)).toBeInTheDocument();
  });

  it('should display formatted skill level', () => {
    render(<PlansList summaries={[mockActivePlan, mockBeginnerPlan]} />);

    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByText('Beginner')).toBeInTheDocument();
  });

  it('should display learning style', () => {
    render(<PlansList summaries={[mockActivePlan, mockCompletedPlan]} />);

    expect(screen.getByText(/Learning style: practice/i)).toBeInTheDocument();
    expect(screen.getByText(/Learning style: mixed/i)).toBeInTheDocument();
  });

  it('should display formatted weekly hours', () => {
    render(<PlansList summaries={[mockCompletedPlan]} />);

    expect(screen.getByText('10 hrs / week')).toBeInTheDocument();
  });

  it('should display beginner plan weekly hours', () => {
    render(<PlansList summaries={[mockBeginnerPlan]} />);

    expect(screen.getByText('3 hrs / week')).toBeInTheDocument();
  });

  it('should display singular "hr" for 1 hour per week', () => {
    const singleHourPlan: PlanSummary = {
      ...mockActivePlan,
      plan: { ...mockActivePlan.plan, weeklyHours: 1 },
    };

    render(<PlansList summaries={[singleHourPlan]} />);

    expect(screen.getByText('1 hr / week')).toBeInTheDocument();
  });

  it('should display formatted creation date', () => {
    render(<PlansList summaries={[mockCompletedPlan]} />);

    // Should format as "Jan 15, 2024"
    expect(screen.getByText(/Jan 15, 2024/i)).toBeInTheDocument();
  });

  it('should display formatted creation date for beginner plan', () => {
    render(<PlansList summaries={[mockBeginnerPlan]} />);

    // Should format as "Mar 1, 2024"
    expect(screen.getByText(/Mar 1, 2024/i)).toBeInTheDocument();
  });

  it('should display "Continue" button for active plans', () => {
    render(<PlansList summaries={[mockActivePlan]} />);

    const continueButton = screen.getByRole('link', { name: /continue/i });
    expect(continueButton).toBeInTheDocument();
    expect(continueButton).toHaveAttribute('href', '/plans/plan-2');
  });

  it('should display "Review" button for completed plans', () => {
    render(<PlansList summaries={[mockCompletedPlan]} />);

    const reviewButton = screen.getByRole('link', { name: /review/i });
    expect(reviewButton).toBeInTheDocument();
    expect(reviewButton).toHaveAttribute('href', '/plans/plan-1');
  });

  it('should render correct link for each plan', () => {
    render(<PlansList summaries={[mockCompletedPlan, mockActivePlan]} />);

    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/plans/plan-1');
    expect(links[1]).toHaveAttribute('href', '/plans/plan-2');
  });

  it('should handle plans with no modules', () => {
    const emptyModulesPlan: PlanSummary = {
      ...mockActivePlan,
      modules: [],
    };

    render(<PlansList summaries={[emptyModulesPlan]} />);

    // Should show Week 1 of 1 as fallback
    expect(screen.getByText(/Week 1 of 1/i)).toBeInTheDocument();
  });

  it('should display 100% for completed plans', () => {
    render(<PlansList summaries={[mockCompletedPlan]} />);

    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('should display 0% for newly started plans', () => {
    render(<PlansList summaries={[mockBeginnerPlan]} />);

    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('should maintain grid layout structure', () => {
    const { container } = render(
      <PlansList summaries={[mockCompletedPlan, mockActivePlan]} />
    );

    const grid = container.querySelector('.grid');
    expect(grid).toBeInTheDocument();
    expect(grid?.children.length).toBe(2);
  });
});
