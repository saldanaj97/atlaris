import AppError from '@/app/(app)/error';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

describe('AppError', () => {
  it('shows a recoverable error state and retries on request', async () => {
    const retry = vi.fn();
    const user = userEvent.setup();

    render(<AppError error={new Error('load failed')} retry={retry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(retry).toHaveBeenCalledOnce();
  });
});
