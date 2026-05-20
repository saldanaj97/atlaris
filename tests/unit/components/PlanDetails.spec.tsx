import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClientPlanDetail } from '@/shared/types/client.types';

vi.mock('next/navigation', async (orig) => {
  const actual = (await orig) as unknown as typeof import('next/navigation');
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn() }),
  };
});

vi.mock('@/app/(app)/plans/[id]/components/PlanPendingState', () => ({
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
  vi.stubGlobal('React', React);
  try {
    const { PlanDetails } =
      await import('@/app/(app)/plans/[id]/components/PlanDetails');
    return render(<PlanDetails plan={plan} />);
  } finally {
    vi.unstubAllGlobals();
  }
}

function createMockPlan(status: ClientPlanDetail['status']): ClientPlanDetail {
  return {
    id: 'test-plan-id',
    topic: 'Test Learning Topic',
    skillLevel: 'intermediate',
    weeklyHours: 5,
    learningStyle: 'mixed',
    visibility: 'private',
    origin: 'ai',
    status,
    totalTasks: 0,
    completedTasks: 0,
    totalMinutes: 0,
    completedMinutes: 0,
    completedModules: 0,
    modules: [],
  };
}

describe('PlanDetails', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it.each(['pending', 'processing'] as const)(
    'renders pending state for %s plans',
    async (status) => {
      await renderPlanDetails(createMockPlan(status));

      expect(screen.getByTestId('plan-pending-state')).toBeInTheDocument();
      expect(screen.queryByText(/learning modules/i)).not.toBeInTheDocument();
    },
  );
});
