import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClientPlanDetail } from '@/lib/types/client';
import type { ScheduleJson } from '@/lib/scheduling/types';

// Mock next/navigation useRouter
const pushMock = vi.fn();
const backMock = vi.fn();
vi.mock('next/navigation', async (orig) => {
  const actual = (await orig) as unknown as typeof import('next/navigation');
  return {
    ...actual,
    useRouter: () => ({ push: pushMock, back: backMock }),
  };
});

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock DatePicker to a simple input for easier interaction in tests
vi.mock('@/components/ui/date-picker', () => {
  return {
    DatePicker: ({
      id,
      value,
      onChange,
      required,
      className,
    }: {
      id: string;
      value?: string;
      onChange?: (val: string | undefined) => void;
      required?: boolean;
      className?: string;
    }) => (
      <input
        id={id}
        data-testid={id}
        value={value ?? ''}
        onChange={(e) =>
          onChange?.((e.currentTarget as HTMLInputElement).value || undefined)
        }
        required={required}
        className={className}
      />
    ),
  };
});

// Mock the shadcn Select to a native select for reliability in tests
vi.mock('@/components/ui/select', () => {
  return {
    Select: ({
      children,
      value,
      onValueChange,
    }: {
      children: React.ReactNode;
      value?: string;
      onValueChange?: (val: string) => void;
    }) => (
      <select
        data-testid="weeklyHours"
        value={value ?? ''}
        onChange={(e) => onValueChange?.((e.target as HTMLSelectElement).value)}
      >
        {children}
      </select>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => (
      <option value="" disabled>
        {placeholder}
      </option>
    ),
    SelectContent: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children: React.ReactNode;
    }) => <option value={value}>{children}</option>,
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
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

// Mock createPlan API
const createPlanMock = vi.fn();
vi.mock('@/lib/api/plans', async (orig) => {
  const actual = (await orig) as unknown as typeof import('@/lib/api/plans');
  return {
    ...actual,
    createPlan: (...args: unknown[]) => createPlanMock(...args),
  };
});

function goToNext() {
  const nextBtn = screen.getByRole('button', { name: /next/i });
  return fireEvent.click(nextBtn);
}

function selectSkillLevel(value: 'beginner' | 'intermediate' | 'advanced') {
  const radio = screen.getByRole('radio', { name: new RegExp(value, 'i') });
  return fireEvent.click(radio);
}

function selectWeeklyHoursLabel(label: string) {
  const sel = screen.getByTestId('weeklyHours') as HTMLSelectElement;
  const option = Array.from(sel.options).find((o) => o.textContent === label);
  if (!option) throw new Error('Option not found: ' + label);
  fireEvent.change(sel, { target: { value: option.value } });
}

async function renderOnboardingForm() {
  (globalThis as any).React = React;
  const { default: OnboardingForm } = await import(
    '@/components/plans/OnboardingForm'
  );
  return render(<OnboardingForm />);
}

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
    modules: [],
  };
}

function createMockSchedule(): ScheduleJson {
  return {
    weeks: [],
    totalWeeks: 0,
    totalSessions: 0,
  };
}

// Shared date formatter (YYYY-MM-DD)
const fmt = (dt: Date) => {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

describe('Regeneration UI', () => {
  beforeEach(() => {
    pushMock.mockReset();
    backMock.mockReset();
    createPlanMock.mockReset();
    vi.clearAllMocks();
  });

  describe('Free-tier cap prompt', () => {
    it('shows upgrade prompt when free user selects >2 week deadline', async () => {
      // Mock fetch for subscription API to return free tier
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tier: 'free',
          usage: {
            activePlans: { current: 0, limit: 3 },
            regenerations: { used: 0, limit: 5 },
            exports: { used: 0, limit: 10 },
          },
        }),
      });

      await renderOnboardingForm();

      // Step 1: topic
      fireEvent.change(screen.getByLabelText(/learning topic/i), {
        target: { value: 'Mastering React Testing' },
      });
      await goToNext();

      // Step 2: skill level
      selectSkillLevel('beginner');
      await goToNext();

      // Step 3: weekly hours
      selectWeeklyHoursLabel('3-5 hours per week');
      await goToNext();

      // Step 4: learning style
      fireEvent.click(screen.getByRole('radio', { name: /mixed approach/i }));
      await goToNext();

      // Step 5: dates - set deadline > 2 weeks (3 weeks)
      const today = new Date();
      const deadline = new Date(today);
      deadline.setDate(today.getDate() + 21); // 3 weeks

      fireEvent.change(screen.getByTestId('deadlineDate'), {
        target: { value: fmt(deadline) },
      });

      // Wait for the effect to run and check for upgrade prompt
      await waitFor(() => {
        const prompt = screen.getByText(/free tier limited to/i);
        expect(prompt).toBeVisible();
        expect(prompt).toHaveTextContent(/free tier limited to 2-week plans/i);
      });

      // Verify link to pricing page exists
      const upgradeLink = screen.getByRole('link', { name: /starter or pro/i });
      expect(upgradeLink).toHaveAttribute('href', '/pricing');
    });
  });

  describe('Regenerate button', () => {
    it('POSTs to regenerate API and toggles loading state', async () => {
      const plan = createMockPlan();
      const schedule = createMockSchedule();

      // Mock fetch for regenerate API
      const regenerateFetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 202,
      });
      global.fetch = regenerateFetchMock;

      await renderPlanDetails(plan, schedule);

      // Find regenerate button
      const regenerateButton = screen.getByRole('button', {
        name: /regenerate plan/i,
      });
      expect(regenerateButton).toBeVisible();
      expect(regenerateButton).not.toBeDisabled();

      // Click regenerate button
      fireEvent.click(regenerateButton);

      // Verify button is disabled (loading state)
      expect(regenerateButton).toBeDisabled();
      expect(regenerateButton).toHaveTextContent(/regenerating/i);

      // Verify fetch was called with correct endpoint
      await waitFor(() => {
        expect(regenerateFetchMock).toHaveBeenCalledWith(
          `/api/v1/plans/${plan.id}/regenerate`,
          { method: 'POST' }
        );
      });

      // Wait for loading to complete
      await waitFor(() => {
        expect(regenerateButton).not.toBeDisabled();
        expect(regenerateButton).toHaveTextContent(/regenerate plan/i);
      });
    });
  });
});
