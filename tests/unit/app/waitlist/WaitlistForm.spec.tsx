import {
  WaitlistForm,
  WaitlistFormPreview,
} from '@/app/(landing)/waitlist/components/WaitlistForm';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  joinWaitlist: vi.fn(),
  useClerk: vi.fn(),
  clientLoggerError: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useClerk: mocks.useClerk,
}));

vi.mock('@/lib/logging/client', () => ({
  clientLogger: { error: mocks.clientLoggerError },
}));

describe('WaitlistForm', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.useClerk.mockReturnValue({
      loaded: true,
      joinWaitlist: mocks.joinWaitlist,
    });
  });

  it('joins the Clerk waitlist and confirms', async () => {
    mocks.joinWaitlist.mockResolvedValue({ id: 'wle_1' });
    const user = userEvent.setup();
    render(<WaitlistForm />);

    await user.type(
      screen.getByLabelText('Email address'),
      ' ada@example.com ',
    );
    await user.click(screen.getByRole('button', { name: 'Join the waitlist' }));

    expect(mocks.joinWaitlist).toHaveBeenCalledWith({
      emailAddress: 'ada@example.com',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'You’re on the waitlist. We’ll email your invite when Atlaris opens.',
    );
  });

  it('shows a linked error and keeps the form when joining fails', async () => {
    mocks.joinWaitlist.mockRejectedValue(new Error('rate limited'));
    const user = userEvent.setup();
    render(<WaitlistForm />);

    const input = screen.getByLabelText('Email address');
    await user.type(input, 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Join the waitlist' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/couldn’t add you right now/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', alert.id);
    expect(mocks.clientLoggerError).toHaveBeenCalledOnce();
  });

  it('disables signup until Clerk has loaded', () => {
    mocks.useClerk.mockReturnValue({
      loaded: false,
      joinWaitlist: mocks.joinWaitlist,
    });
    render(<WaitlistForm />);

    expect(
      screen.getByRole('button', { name: 'Join the waitlist' }),
    ).toBeDisabled();
  });

  it('renders a disabled local preview', () => {
    render(<WaitlistFormPreview />);

    expect(screen.getByLabelText('Email address')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Join the waitlist' }),
    ).toBeDisabled();
    expect(screen.getByText(/Local preview/)).toBeVisible();
  });
});
