import { DeleteAccountSection } from '@/app/(app)/settings/profile/components/DeleteAccountSection';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createDeferredPromise } from '@tests/helpers/deferred-promise';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteAccountAction: vi.fn(),
  clientLoggerError: vi.fn(),
  isReverificationCancelledError: vi.fn(),
}));

vi.mock('@/app/(app)/settings/profile/actions', () => ({
  deleteAccountAction: mocks.deleteAccountAction,
}));

vi.mock('@clerk/nextjs', () => ({
  // The real hook wraps the action to run Clerk's reverification flow.
  useReverification: (action: unknown) => action,
}));

vi.mock('@clerk/nextjs/errors', () => ({
  isReverificationCancelledError: mocks.isReverificationCancelledError,
}));

vi.mock('@/lib/logging/client', () => ({
  clientLogger: { error: mocks.clientLoggerError },
}));

describe('DeleteAccountSection', () => {
  let user: ReturnType<typeof userEvent.setup>;
  const replace = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    user = userEvent.setup();
    mocks.isReverificationCancelledError.mockReturnValue(false);
    vi.stubGlobal('location', { ...window.location, replace });
  });

  // The trigger stays mounted behind the dialog, so the confirm button is the
  // last "Delete account" button once the dialog is open.
  async function confirmButton() {
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    const buttons = await screen.findAllByRole('button', {
      name: /Delete account|Deleting/,
    });
    return buttons[buttons.length - 1]!;
  }

  it('leaves the app with a full load once the account is deleted', async () => {
    mocks.deleteAccountAction.mockResolvedValue({ status: 'deleted' });
    render(<DeleteAccountSection />);

    await user.click(await confirmButton());

    expect(replace).toHaveBeenCalledWith('/landing');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    [
      'billing_cancel_failed',
      'We could not cancel your subscription, so your account was not deleted. Try again, or contact support.',
    ],
    ['unavailable', 'Account deletion is not available right now.'],
  ])('shows the %s message and keeps the account', async (status, message) => {
    mocks.deleteAccountAction.mockResolvedValue({ status });
    render(<DeleteAccountSection />);

    await user.click(await confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(replace).not.toHaveBeenCalled();
  });

  it('shows the unknown message when the action throws', async () => {
    mocks.deleteAccountAction.mockRejectedValue(new Error('network down'));
    render(<DeleteAccountSection />);

    await user.click(await confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not confirm whether your account was deleted. Reload the page before trying again.',
    );
    expect(mocks.clientLoggerError).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it('shows no message and re-enables the button when reverification is cancelled', async () => {
    mocks.deleteAccountAction.mockRejectedValue(new Error('cancelled'));
    mocks.isReverificationCancelledError.mockReturnValue(true);
    render(<DeleteAccountSection />);

    const button = await confirmButton();
    await user.click(button);

    await vi.waitFor(() => expect(button).toBeEnabled());
    expect(button).toHaveTextContent('Delete account');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.clientLoggerError).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('does not call the action twice while a deletion is in flight', async () => {
    const pending = createDeferredPromise<{ status: string }>();
    mocks.deleteAccountAction.mockReturnValue(pending.promise);
    render(<DeleteAccountSection />);

    const button = await confirmButton();
    await user.click(button);
    await user.click(button);

    expect(button).toBeDisabled();
    expect(mocks.deleteAccountAction).toHaveBeenCalledTimes(1);

    pending.resolve({ status: 'deleted' });
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/landing'));
  });
});
