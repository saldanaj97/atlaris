import { BulkDeletePlansDialog } from '@/app/(app)/plans/components/BulkDeletePlansDialog';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const onDeleted = vi.fn();
const onOutcomeUnknown = vi.fn();

function ControlledBulkDeleteDialog() {
  const [open, setOpen] = useState(true);

  return (
    <>
      <button type='button' onClick={() => setOpen(true)}>
        Open delete
      </button>
      <BulkDeletePlansDialog
        open={open}
        onOpenChange={setOpen}
        plans={[
          { id: 'plan-1', topic: 'Learn React', status: 'active' },
          { id: 'plan-2', topic: 'Learn TypeScript', status: 'active' },
        ]}
        onDeleted={onDeleted}
        onOutcomeUnknown={onOutcomeUnknown}
      />
    </>
  );
}

describe('BulkDeletePlansDialog', () => {
  beforeEach(() => {
    onDeleted.mockReset();
    onOutcomeUnknown.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('clears a previous error when a later success closes the dialog', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json(
          { error: 'Plan cannot be deleted right now.', code: 'CONFLICT' },
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          deletedCount: 2,
          failedCount: 0,
          results: [
            { planId: 'plan-1', success: true },
            { planId: 'plan-2', success: true },
          ],
        }),
      );

    render(<ControlledBulkDeleteDialog />);

    await user.click(screen.getByRole('button', { name: 'Delete 2 plans' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Plan cannot be deleted right now.',
    );

    await user.click(screen.getByRole('button', { name: 'Delete 2 plans' }));

    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalledTimes(1);
      expect(
        screen.queryByText('Delete selected plans'),
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Open delete' }));

    expect(screen.getByText('Delete selected plans')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
