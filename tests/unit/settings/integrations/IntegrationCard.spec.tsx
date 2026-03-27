import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IntegrationCard } from '@/app/settings/integrations/components/IntegrationCard';

const baseProps = {
  name: 'Google Calendar',
  description: 'Sync your learning schedule.',
  icon: '📅',
  features: ['Auto-sync', 'Smart reminders'],
};

describe('IntegrationCard', () => {
  it('renders name, description, icon, and features', () => {
    render(<IntegrationCard {...baseProps} status="available" />);

    expect(screen.getByText('Google Calendar')).toBeInTheDocument();
    expect(
      screen.getByText('Sync your learning schedule.')
    ).toBeInTheDocument();
    expect(screen.getByText('📅')).toBeInTheDocument();
    expect(screen.getByText('Auto-sync')).toBeInTheDocument();
    expect(screen.getByText('Smart reminders')).toBeInTheDocument();
  });

  it('shows "Available" badge and "Connect" button when status is available', () => {
    render(<IntegrationCard {...baseProps} status="available" />);

    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });

  it('shows "Coming Soon" badge and disabled button when status is coming_soon', () => {
    render(<IntegrationCard {...baseProps} status="coming_soon" />);

    const comingSoonElements = screen.getAllByText('Coming Soon');
    expect(comingSoonElements).toHaveLength(2); // badge + button
    expect(screen.getByRole('button', { name: 'Coming Soon' })).toBeDisabled();
  });

  it('shows "Connected" badge and "Disconnect" button when status is connected', () => {
    render(<IntegrationCard {...baseProps} status="connected" />);

    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Disconnect' })
    ).toBeInTheDocument();
  });

  it('calls onConnect when Connect button is clicked', async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn();

    render(
      <IntegrationCard
        {...baseProps}
        status="available"
        onConnect={onConnect}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it('calls onDisconnect when Disconnect button is clicked', async () => {
    const user = userEvent.setup();
    const onDisconnect = vi.fn();

    render(
      <IntegrationCard
        {...baseProps}
        status="connected"
        onDisconnect={onDisconnect}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('shows loading spinner on Connect when loading', () => {
    render(
      <IntegrationCard {...baseProps} status="available" loading={true} />
    );

    expect(screen.getByText('Connecting…')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows loading spinner on Disconnect when loading', () => {
    render(
      <IntegrationCard {...baseProps} status="connected" loading={true} />
    );

    expect(screen.getByText('Disconnecting…')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
