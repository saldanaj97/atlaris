import { RegeneratePlanDialog } from '@/app/(app)/plans/[id]/components/RegeneratePlanDialog';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
}));

import { toast } from 'sonner';

async function openDialog() {
  const user = userEvent.setup();
  render(<RegeneratePlanDialog planId='plan-1' />);
  await user.click(screen.getByRole('button', { name: 'Regenerate plan' }));
  return user;
}

function submitButton() {
  return screen
    .getByRole('dialog')
    .querySelector<HTMLButtonElement>('button[type="submit"]')!;
}

describe('RegeneratePlanDialog', () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    vi.mocked(toast.success).mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('posts the chosen reasons and trimmed note, then refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json(
        { planId: 'plan-1', jobId: 'job-1', status: 'pending' },
        { status: 202 },
      ),
    );
    const user = await openDialog();

    expect(
      screen.getByRole('dialog', { name: 'Regenerate plan' }),
    ).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: 'Too long' }));
    await user.click(screen.getByRole('checkbox', { name: 'Too basic' }));
    await user.type(
      screen.getByRole('textbox', { name: /anything else/i }),
      '  More projects  ',
    );
    expect(screen.getByText('17/500 characters')).toBeInTheDocument();
    await user.click(submitButton());

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/v1/plans/plan-1/regenerate');
    // Chip order, not click order.
    expect(JSON.parse(String(init?.body))).toEqual({
      reasons: ['too_basic', 'too_long'],
      note: 'More projects',
    });
    expect(toast.success).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('omits an empty note', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({}, { status: 202 }));
    const user = await openDialog();

    await user.click(submitButton());

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]?.body)),
    ).toEqual({ reasons: [] });
  });

  it('keeps the dialog and its values open on a quota refusal', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json(
        {
          error: 'Regeneration quota exceeded for your subscription tier.',
          code: 'REGENERATION_QUOTA_EXCEEDED',
        },
        { status: 429 },
      ),
    );
    const user = await openDialog();

    await user.click(screen.getByRole('checkbox', { name: 'Too short' }));
    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /reached your regeneration limit/i,
    );
    expect(screen.getByRole('checkbox', { name: 'Too short' })).toBeChecked();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('links to pricing when regeneration is not included', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json(
        {
          error: 'Plan regeneration is not included on the Free plan.',
          code: 'PLAN_REGENERATION_NOT_INCLUDED',
        },
        { status: 403 },
      ),
    );
    const user = await openDialog();

    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(/not included/i);
    expect(screen.getByRole('link', { name: 'See plans' })).toHaveAttribute(
      'href',
      '/pricing',
    );
  });

  it('refreshes into the Regenerating state when a job is already queued', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json(
        { error: 'Already queued.', code: 'REGENERATION_ALREADY_QUEUED' },
        { status: 409 },
      ),
    );
    const user = await openDialog();

    await user.click(submitButton());

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the unavailable copy on a 503', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json(
        { error: 'disabled', code: 'SERVICE_UNAVAILABLE' },
        { status: 503 },
      ),
    );
    const user = await openDialog();

    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /unavailable right now/i,
    );
  });
});
