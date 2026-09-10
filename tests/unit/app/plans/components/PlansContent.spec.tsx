import type { PlansPageData } from '@/app/(app)/plans/plans-page-data';

import {
  PlansHeaderCreateAction,
  shouldShowPlansLibraryChrome,
} from '@/app/(app)/plans/components/PlansContent';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

function createPageData(
  overrides: Partial<PlansPageData['plansPage']> = {},
): PlansPageData {
  return {
    plansPage: {
      items: [],
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 0,
      totalSearchResults: 0,
      statusCounts: {
        not_started: 0,
        active: 14,
        paused: 0,
        completed: 10,
        generating: 0,
        failed: 0,
      },
      referenceTimestamp: '2024-06-01T00:00:00.000Z',
      canCreatePlan: true,
      ...overrides,
    },
    usage: {
      tier: 'free',
      activePlans: { current: 45, limit: 1 },
      regenerations: { used: 0, limit: 0 },
    },
  };
}

describe('PlansHeaderCreateAction', () => {
  it('renders the New Plan entitlement action without library metrics', async () => {
    render(
      await PlansHeaderCreateAction({
        dataPromise: Promise.resolve(createPageData()),
      }),
    );

    expect(screen.getByRole('link', { name: 'New Plan' })).toHaveAttribute(
      'href',
      '/plans/new',
    );
    expect(screen.queryByText('14')).not.toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/active plans used/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /browse templates/i }),
    ).not.toBeInTheDocument();
  });

  it('routes the entitlement action to pricing when a new plan is not allowed', async () => {
    render(
      await PlansHeaderCreateAction({
        dataPromise: Promise.resolve(createPageData({ canCreatePlan: false })),
      }),
    );

    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute(
      'href',
      '/pricing',
    );
    expect(
      screen.queryByRole('link', { name: 'New Plan' }),
    ).not.toBeInTheDocument();
  });
});

describe('shouldShowPlansLibraryChrome', () => {
  it('hides chrome for first-run empty libraries', () => {
    expect(
      shouldShowPlansLibraryChrome(
        { totalSearchResults: 0 },
        { search: '', status: 'all' },
      ),
    ).toBe(false);
  });

  it('hides chrome when Free-plan selection is required', () => {
    expect(
      shouldShowPlansLibraryChrome(
        { selectionRequired: true, totalSearchResults: 4 },
        { search: '', status: 'all' },
      ),
    ).toBe(false);
  });

  it('keeps chrome for filtered empty results', () => {
    expect(
      shouldShowPlansLibraryChrome(
        { totalSearchResults: 0 },
        { search: 'react', status: 'all' },
      ),
    ).toBe(true);
    expect(
      shouldShowPlansLibraryChrome(
        { totalSearchResults: 0 },
        { search: '', status: 'completed' },
      ),
    ).toBe(true);
  });
});
