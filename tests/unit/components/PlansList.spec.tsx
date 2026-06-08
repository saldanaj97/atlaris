import type React from 'react';

import {
  buildModuleRows,
  buildPlan,
  buildPlanSummary,
} from '../../fixtures/plan-detail';
import { PlansList } from '@/app/(app)/plans/components/PlansList';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe('PlansList', () => {
  const referenceTimestamp = '2024-06-01T00:00:00.000Z';

  const activePlan = buildPlanSummary({
    plan: buildPlan({
      id: 'plan-1',
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
    modules: buildModuleRows('plan-1', 6, { estimatedMinutes: 100 }),
  });

  const completedPlan = buildPlanSummary({
    plan: buildPlan({
      id: 'plan-2',
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
    modules: buildModuleRows('plan-2', 4, { estimatedMinutes: 200 }),
  });

  it('should render empty state when no plans provided', () => {
    render(
      <PlansList summaries={[]} referenceTimestamp={referenceTimestamp} />,
    );

    expect(screen.getByText('No plans found')).toBeInTheDocument();
    expect(
      screen.getByText(/Create your first plan to get started/i),
    ).toBeInTheDocument();
  });

  it('should render correct link for each plan', () => {
    render(
      <PlansList
        summaries={[activePlan, completedPlan]}
        referenceTimestamp={referenceTimestamp}
      />,
    );

    const planLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/plans/'));
    expect(planLinks).toHaveLength(2);
    expect(planLinks[0]).toHaveAttribute('href', '/plans/plan-1');
    expect(planLinks[1]).toHaveAttribute('href', '/plans/plan-2');
  });

  it('should handle plans with no modules gracefully', () => {
    render(
      <PlansList
        summaries={[{ ...activePlan, modules: [] }]}
        referenceTimestamp={referenceTimestamp}
      />,
    );

    expect(screen.getByText('Master React Hooks')).toBeInTheDocument();
  });
});
