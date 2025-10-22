import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// We'll import the component after ensuring global React is defined for jsx:preserve

// Mock the DatePicker to a simple input for easier interaction in tests
vi.mock('@/components/ui/date-picker', () => {
  return {
    DatePicker: ({ id, value, onChange, required, className }: any) => (
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
    Select: ({ children, value, onValueChange }: any) => (
      <select
        data-testid="weeklyHours"
        value={value ?? ''}
        onChange={(e) => onValueChange?.((e.target as HTMLSelectElement).value)}
      >
        {children}
      </select>
    ),
    SelectTrigger: ({ children }: any) => <>{children}</>,
    SelectValue: ({ placeholder }: any) => (
      <option value="" disabled>
        {placeholder}
      </option>
    ),
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ value, children }: any) => (
      <option value={value}>{children}</option>
    ),
  };
});

// Mock next/navigation useRouter for redirection assertions
const pushMock = vi.fn();
const backMock = vi.fn();
vi.mock('next/navigation', async (orig) => {
  const actual: any = await (orig as any)();
  return {
    ...actual,
    useRouter: () => ({ push: pushMock, back: backMock }),
  };
});

// Mock createPlan API to avoid network/DB concerns in UI flow tests
const createPlanMock = vi.fn();
vi.mock('@/lib/api/plans', async (orig) => {
  const actual: any = await (orig as any);
  return {
    ...actual,
    createPlan: (...args: any[]) => createPlanMock(...args),
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
  const sel = screen.getByTestId('weeklyHours') as unknown as HTMLSelectElement;
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

describe('Onboarding date picker flow (E2E UI subset)', () => {
  beforeEach(() => {
    pushMock.mockReset();
    backMock.mockReset();
    createPlanMock.mockReset();
  });

  it('rejects a past deadline and does not submit', async () => {
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

    // Step 5: dates - pick a past deadline (yesterday)
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const y = yesterday.getFullYear();
    const m = String(yesterday.getMonth() + 1).padStart(2, '0');
    const d = String(yesterday.getDate()).padStart(2, '0');
    const past = `${y}-${m}-${d}`;

    fireEvent.change(screen.getByTestId('deadlineDate'), {
      target: { value: past },
    });

    // Attempt to submit
    const submitBtn = screen.getByRole('button', {
      name: /generate learning path/i,
    });
    fireEvent.click(submitBtn);

    // Expect no navigation and no API call on invalid dates
    expect(createPlanMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('submits with valid start and deadline dates and navigates to plan', async () => {
    await renderOnboardingForm();

    // Step 1
    fireEvent.change(screen.getByLabelText(/learning topic/i), {
      target: { value: 'Learn Systems Design' },
    });
    await goToNext();

    // Step 2
    selectSkillLevel('intermediate');
    await goToNext();

    // Step 3
    selectWeeklyHoursLabel('3-5 hours per week');
    await goToNext();

    // Step 4
    fireEvent.click(
      screen.getByRole('radio', { name: /reading & documentation/i })
    );
    await goToNext();

    // Step 5: valid dates
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() + 1);
    const deadline = new Date(today);
    deadline.setDate(today.getDate() + 30);

    const fmt = (dt: Date) => {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    fireEvent.change(screen.getByTestId('startDate'), {
      target: { value: fmt(start) },
    });
    fireEvent.change(screen.getByTestId('deadlineDate'), {
      target: { value: fmt(deadline) },
    });

    createPlanMock.mockResolvedValueOnce({ id: 'plan-abc123' });

    const submitBtn = screen.getByRole('button', {
      name: /generate learning path/i,
    });
    fireEvent.click(submitBtn);

    expect(createPlanMock).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith('/plans/plan-abc123')
    );

    // Also assert the payload contained start/deadline
    const payloadArg = createPlanMock.mock.calls[0]?.[0];
    expect(payloadArg.startDate).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(payloadArg.deadlineDate).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('submits with omitted start date and defaults start to today', async () => {
    await renderOnboardingForm();

    // Step 1
    fireEvent.change(screen.getByLabelText(/learning topic/i), {
      target: { value: 'Network Engineering' },
    });
    await goToNext();

    // Step 2
    selectSkillLevel('beginner');
    await goToNext();

    // Step 3
    selectWeeklyHoursLabel('1-2 hours per week');
    await goToNext();

    // Step 4
    fireEvent.click(screen.getByRole('radio', { name: /video content/i }));
    await goToNext();

    // Step 5: omit start date; set a valid deadline only
    const todayStr = new Date().toISOString().slice(0, 10);
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 45);
    const deadlineStr = `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, '0')}-${String(deadline.getDate()).padStart(2, '0')}`;

    fireEvent.change(screen.getByTestId('deadlineDate'), {
      target: { value: deadlineStr },
    });

    createPlanMock.mockResolvedValueOnce({ id: 'plan-def456' });

    const submitBtn = screen.getByRole('button', {
      name: /generate learning path/i,
    });
    fireEvent.click(submitBtn);

    expect(createPlanMock).toHaveBeenCalledTimes(1);
    const payloadArg = createPlanMock.mock.calls[0]?.[0];
    expect(payloadArg.startDate).toBe(todayStr);
    expect(payloadArg.deadlineDate).toBe(deadlineStr);
  });
});
