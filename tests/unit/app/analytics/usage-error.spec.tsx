import UsageAnalyticsError from '@/app/(app)/analytics/usage/error';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

describe('UsageAnalyticsError', () => {
  it('refreshes analytics data when recovery is selected', async () => {
    const reset = vi.fn();
    const user = userEvent.setup();

    render(
      <UsageAnalyticsError error={new Error('load failed')} reset={reset} />,
    );

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(reset).toHaveBeenCalledOnce();
  });
});
