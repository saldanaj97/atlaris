import PlansError from '@/app/(app)/plans/error';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

describe('PlansError', () => {
  it('retries loading the plans page on request', async () => {
    const retry = vi.fn();
    const user = userEvent.setup();

    render(<PlansError error={new Error('load failed')} retry={retry} />);

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(retry).toHaveBeenCalledOnce();
  });
});
