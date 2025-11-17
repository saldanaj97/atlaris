import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import PlansList from '@/components/plans/PlansList';
import type { PlanSummary } from '@/lib/types/db';

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
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
      createdAt: new Date('2024-01-15'),
      updatedAt: new Date('2024-01-15'),
    },
    completion: 1.0,
    completedModules: 4,
    totalModules: 4,
    completedTasks: 20,
    totalTasks: 20,
    modules: [
      { id: 'mod-1', weekNumber: 1, title: 'Week 1' },
      { id: 'mod-2', weekNumber: 2, title: 'Week 2' },
      { id: 'mod-3', weekNumber: 3, title: 'Week 3' },
      { id: 'mod-4', weekNumber: 4, title: 'Week 4' },
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
      createdAt: new Date('2024-02-01'),
      updatedAt: new Date('2024-02-10'),
    },
    completion: 0.4,
    completedModules: 2,
    totalModules: 6,
    completedTasks: 8,
    totalTasks: 20,
    modules: [
      { id: 'mod-1', weekNumber: 1, title: 'Week 1' },
      { id: 'mod-2', weekNumber: 2, title: 'Week 2' },
      { id: 'mod-3', weekNumber: 3, title: 'Week 3' },
      { id: 'mod-4', weekNumber: 4, title: 'Week 4' },
      { id: 'mod-5', weekNumber: 5, title: 'Week 5' },
      { id: 'mod-6', weekNumber: 6, title: 'Week 6' },
    ],
  };

  const mockBeginnerPlan: PlanSummary = {
    plan: {
      id: 'plan-3',
      userId: 'user-1',
      topic: 'Python Basics',
      skillLevel: 'beginner',
      weeklyHours: null,
      learningStyle: 'reading',
      createdAt: null,
      updatedAt: new Date('2024-03-01'),
    },
    completion: 0.0,
    completedModules: 0,
    totalModules: 3,
    completedTasks: 0,
    totalTasks: 15,
    modules: [
      { id: 'mod-1', weekNumber: 1, title: 'Week 1' },
      { id: 'mod-2', weekNumber: 2, title: 'Week 2' },
      { id: 'mod-3', weekNumber: 3, title: 'Week 3' },
    ],
  };

  it('should render empty state when no plans provided', () => {
    const { container } = render(<PlansList summaries={[]} />);
    expect(container.querySelector('.grid')).toBeInTheDocument();
    expect(container.querySelector('.grid')?.children.length).toBe(0);
  });

  it('should render all provided plans', () => {
    render(<PlansList summaries={[mockCompletedPlan, mockActivePlan, mockBeginnerPlan]} />);

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

    // completedModules: 2, totalModules: 6, so current week is 3
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

  it('should display flexible hours when weeklyHours is null', () => {
    render(<PlansList summaries={[mockBeginnerPlan]} />);

    expect(screen.getByText('Flexible weekly hours')).toBeInTheDocument();
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

  it('should display default text when creation date is null', () => {
    render(<PlansList summaries={[mockBeginnerPlan]} />);

    expect(screen.getByText(/Created recently/i)).toBeInTheDocument();
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
      totalModules: 0,
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
    const { container } = render(<PlansList summaries={[mockCompletedPlan, mockActivePlan]} />);

    const grid = container.querySelector('.grid');
    expect(grid).toBeInTheDocument();
    expect(grid?.children.length).toBe(2);
  });
});
