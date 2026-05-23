import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IntegrationCard } from '@/app/(app)/settings/integrations/components/IntegrationCard';

const baseProps = {
  name: 'Google Calendar',
  description: 'Sync your learning schedule.',
  icon: 'calendar',
  features: ['Auto-sync', 'Smart reminders'],
};

describe('IntegrationCard', () => {
  it('calls onConnect when Connect is clicked', async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn();

    render(
      <IntegrationCard
        {...baseProps}
        status="available"
        onConnect={onConnect}
      />,
    );

    const card = screen.getByRole('region', { name: 'Google Calendar' });

    await user.click(within(card).getByRole('button', { name: 'Connect' }));

    expect(onConnect).toHaveBeenCalledOnce();
  });

  it('calls onDisconnect when Disconnect is clicked', async () => {
    const user = userEvent.setup();
    const onDisconnect = vi.fn();

    render(
      <IntegrationCard
        {...baseProps}
        status="connected"
        onDisconnect={onDisconnect}
      />,
    );

    const card = screen.getByRole('region', { name: 'Google Calendar' });

    await user.click(within(card).getByRole('button', { name: 'Disconnect' }));

    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('keeps connect disabled and harmless when no handler is provided', async () => {
    const user = userEvent.setup();

    render(<IntegrationCard {...baseProps} status="available" />);

    const card = screen.getByRole('region', { name: 'Google Calendar' });
    const button = within(card).getByRole('button', { name: 'Connect' });

    expect(button).toBeDisabled();
    await user.click(button);
  });
});
