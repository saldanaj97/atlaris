import { PlansList } from '@/app/plans/components/PlansList';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  buildModuleRows,
  buildPlan,
  buildPlanSummary,
} from '../../fixtures/plan-detail';

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
  const referenceTimestamp = '2024-06-01T00:00:00.000Z';

  const mockCompletedPlan = buildPlanSummary({
    plan: buildPlan({
      id: 'plan-1',
      topic: 'Learn TypeScript',
      skillLevel: 'intermediate',
      weeklyHours: 10,
      learningStyle: 'mixed',
      startDate: '2024-01-15',
      deadlineDate: '2024-05-15',
      generationStatus: 'ready',
      finalizedAt: new Date('2024-01-15'),
      createdAt: new Date('2024-01-15'),
      updatedAt: new Date('2024-01-15'),
    }),
    completion: 1.0,
    completedModules: 4,
    completedTasks: 20,
    totalTasks: 20,
    totalMinutes: 800,
    completedMinutes: 800,
    modules: buildModuleRows('plan-1', 4, { estimatedMinutes: 200 }),
  });

  const mockActivePlan = buildPlanSummary({
    plan: buildPlan({
      id: 'plan-2',
      topic: 'Master React Hooks',
      skillLevel: 'advanced',
      weeklyHours: 5,
      learningStyle: 'practice',
      startDate: '2024-02-01',
      deadlineDate: null,
      generationStatus: 'ready',
      isQuotaEligible: true,
      finalizedAt: new Date('2024-02-01'),
      createdAt: new Date('2024-02-01'),
      updatedAt: new Date('2024-02-10'),
    }),
    completion: 0.4,
    completedModules: 2,
    completedTasks: 8,
    totalTasks: 20,
    totalMinutes: 600,
    completedMinutes: 240,
    modules: buildModuleRows('plan-2', 6, { estimatedMinutes: 100 }),
  });

  const mockBeginnerPlan = buildPlanSummary({
    plan: buildPlan({
      id: 'plan-3',
      topic: 'Python Basics',
      skillLevel: 'beginner',
      weeklyHours: 3,
      learningStyle: 'reading',
      startDate: null,
      deadlineDate: null,
      finalizedAt: null,
      createdAt: new Date('2024-03-01'),
      updatedAt: new Date('2024-03-01'),
    }),
    completion: 0.0,
    completedModules: 0,
    completedTasks: 0,
    totalTasks: 15,
    totalMinutes: 450,
    completedMinutes: 0,
    modules: buildModuleRows('plan-3', 3, { estimatedMinutes: 150 }),
  });

  it('should render empty state when no plans provided', () => {
    render(
      <PlansList summaries={[]} referenceTimestamp={referenceTimestamp} />
    );

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
        referenceTimestamp={referenceTimestamp}
      />
    );

    expect(screen.getByText('Learn TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Master React Hooks')).toBeInTheDocument();
    expect(screen.getByText('Python Basics')).toBeInTheDocument();
  });

  it('should display correct progress percentage for completed plans', () => {
    render(
      <PlansList
        summaries={[mockCompletedPlan]}
        referenceTimestamp={referenceTimestamp}
      />
    );

    // 1.0 * 100 = 100%
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('should display correct progress percentage for active plans', () => {
    render(
      <PlansList
        summaries={[mockActivePlan]}
        referenceTimestamp={referenceTimestamp}
      />
    );

    // 0.4 * 100 = 40%
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('should display correct task completion count', () => {
    render(
      <PlansList
        summaries={[mockActivePlan]}
        referenceTimestamp={referenceTimestamp}
      />
    );

    // PlanRow shows tasks as X/Y format
    expect(screen.getByText('8/20')).toBeInTheDocument();
  });

  it('should display task completion count for completed plans', () => {
    render(
      <PlansList
        summaries={[mockCompletedPlan]}
        referenceTimestamp={referenceTimestamp}
      />
    );

    expect(screen.getByText('20/20')).toBeInTheDocument();
  });

  it('should display 0% for newly started plans', () => {
    render(
      <PlansList
        summaries={[mockBeginnerPlan]}
        referenceTimestamp={referenceTimestamp}
      />
    );

    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('should display task count for beginner plan', () => {
    render(
      <PlansList
        summaries={[mockBeginnerPlan]}
        referenceTimestamp={referenceTimestamp}
      />
    );

    expect(screen.getByText('0/15')).toBeInTheDocument();
  });

  it('should render correct link for each plan', () => {
    render(
      <PlansList
        summaries={[mockCompletedPlan, mockActivePlan]}
        referenceTimestamp={referenceTimestamp}
      />
    );

    const links = screen.getAllByRole('link');
    const planLinks = links.filter(
      (link) => link.getAttribute('href')?.startsWith('/plans/plan-') ?? false
    );
    expect(planLinks).toHaveLength(2);
    expect(planLinks[0]).toHaveAttribute('href', '/plans/plan-1');
    expect(planLinks[1]).toHaveAttribute('href', '/plans/plan-2');
  });

  it('should display search input', () => {
    render(
      <PlansList
        summaries={[mockActivePlan]}
        referenceTimestamp={referenceTimestamp}
      />
    );

    expect(screen.getByPlaceholderText('Search plans...')).toBeInTheDocument();
  });

  it('should display filter buttons', () => {
    render(
      <PlansList
        summaries={[mockActivePlan]}
        referenceTimestamp={referenceTimestamp}
      />
    );

    expect(screen.getByText('All Plans')).toBeInTheDocument();
    expect(screen.getByText(/Active/)).toBeInTheDocument();
    expect(screen.getByText(/Completed/)).toBeInTheDocument();
    expect(screen.getByText(/Inactive/)).toBeInTheDocument();
  });

  it('should display view plan buttons', () => {
    render(
      <PlansList
        summaries={[mockActivePlan]}
        referenceTimestamp={referenceTimestamp}
      />
    );

    // PlanRow has a "View plan" button
    expect(
      screen.getByRole('button', { name: /view plan/i })
    ).toBeInTheDocument();
  });

  it('should handle plans with no modules gracefully', () => {
    const emptyModulesPlan = buildPlanSummary({
      ...mockActivePlan,
      modules: [],
    });

    render(
      <PlansList
        summaries={[emptyModulesPlan]}
        referenceTimestamp={referenceTimestamp}
      />
    );

    // Should still render the plan topic
    expect(screen.getByText('Master React Hooks')).toBeInTheDocument();
  });

  it('should maintain list layout structure', () => {
    const { container } = render(
      <PlansList
        summaries={[mockCompletedPlan, mockActivePlan]}
        referenceTimestamp={referenceTimestamp}
      />
    );

    // New component uses space-y-1 div for list
    const listContainer = container.querySelector('.space-y-1');
    expect(listContainer).toBeInTheDocument();
    expect(listContainer?.children.length).toBe(2);
  });
});
