import { DeletePlanDialog } from '@/app/(app)/plans/components/DeletePlanDialog';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock('posthog-js', () => ({
  default: { capture: vi.fn() },
}));

import { toast } from 'sonner';

function ControlledDeletePlanDialog() {
  const [open, setOpen] = useState(true);
  const actionsRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button ref={actionsRef} type='button'>
        Actions
      </button>
      <input ref={searchRef} type='search' aria-label='Search plans' />
      <DeletePlanDialog
        planId='plan-1'
        planTopic='Learn React'
        isGenerating={false}
        open={open}
        onOpenChange={setOpen}
        returnFocusRef={actionsRef}
        successFocusRef={searchRef}
      />
    </>
  );
}

describe('DeletePlanDialog', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockRefresh.mockReset();
    vi.mocked(toast.error).mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('keeps a definitive server error in the dialog for retry', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      Response.json(
        { error: 'Plan cannot be deleted right now.', code: 'CONFLICT' },
        { status: 409 },
      ),
    );

    render(<ControlledDeletePlanDialog />);
    await user.click(screen.getByRole('button', { name: 'Delete plan' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Plan cannot be deleted right now.',
    );
    expect(screen.getByRole('button', { name: 'Delete plan' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('returns controlled dismissal to the lasting row action trigger', async () => {
    const user = userEvent.setup();

    render(<ControlledDeletePlanDialog />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Actions' }),
      ),
    );
  });

  it('focuses the surviving search control after successful deletion', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    render(<ControlledDeletePlanDialog />);
    await user.click(screen.getByRole('button', { name: 'Delete plan' }));

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('searchbox', { name: 'Search plans' }),
      ),
    );
    expect(mockPush).toHaveBeenCalledWith('/plans');
    expect(mockRefresh).toHaveBeenCalled();
  });
});
