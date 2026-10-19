import { EmptyPlansList } from '@/app/(app)/plans/components/EmptyPlansList';
import { ROUTES } from '@/features/navigation/routes';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('EmptyPlansList', () => {
  it('offers a clear-filters link when a search matches no plans', () => {
    render(
      <EmptyPlansList canCreatePlan searchQuery='rust' filterStatus='all' />,
    );

    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute(
      'href',
      ROUTES.PLANS.ROOT,
    );
  });

  it('uses the provided clear-filters href so the sort is kept', () => {
    render(
      <EmptyPlansList
        searchQuery='rust'
        filterStatus='all'
        clearFiltersHref='/plans?sort=recent'
      />,
    );

    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute(
      'href',
      '/plans?sort=recent',
    );
  });

  it('offers a clear-filters link when a status filter matches no plans', () => {
    render(<EmptyPlansList searchQuery='' filterStatus='active' />);

    expect(
      screen.getByRole('link', { name: 'Clear filters' }),
    ).toBeInTheDocument();
  });

  it('omits clear filters for the first-run empty state', () => {
    render(
      <EmptyPlansList
        canCreatePlan
        isFirstRun
        searchQuery=''
        filterStatus='all'
      />,
    );

    expect(
      screen.queryByRole('link', { name: 'Clear filters' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New plan' })).toBeVisible();
  });
});
