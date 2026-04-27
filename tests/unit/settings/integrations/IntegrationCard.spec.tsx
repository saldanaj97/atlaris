import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IntegrationCard } from '@/app/(app)/settings/integrations/components/IntegrationCard';

const baseProps = {
	name: 'Google Calendar',
	description: 'Sync your learning schedule.',
	icon: '📅',
	features: ['Auto-sync', 'Smart reminders'],
};

describe('IntegrationCard', () => {
	it('renders name, description, icon, and features', () => {
		render(
			<IntegrationCard {...baseProps} status="available" onConnect={vi.fn()} />,
		);

		const card = screen.getByRole('region', { name: 'Google Calendar' });

		expect(within(card).getByText('Google Calendar')).toBeInTheDocument();
		expect(
			within(card).getByText('Sync your learning schedule.'),
		).toBeInTheDocument();
		expect(within(card).getByText('📅')).toBeInTheDocument();
		expect(within(card).getByText('Auto-sync')).toBeInTheDocument();
		expect(within(card).getByText('Smart reminders')).toBeInTheDocument();
	});

	it('shows an available badge and connect button', () => {
		render(
			<IntegrationCard {...baseProps} status="available" onConnect={vi.fn()} />,
		);

		const card = screen.getByRole('region', { name: 'Google Calendar' });

		expect(
			within(card).getByRole('status', { name: 'Available' }),
		).toBeInTheDocument();
		expect(
			within(card).getByRole('button', { name: 'Connect' }),
		).toBeInTheDocument();
	});

	it('shows a coming soon badge and disabled button', () => {
		render(<IntegrationCard {...baseProps} status="coming_soon" />);

		const card = screen.getByRole('region', { name: 'Google Calendar' });

		expect(
			within(card).getByRole('status', { name: 'Coming Soon' }),
		).toBeInTheDocument();
		expect(
			within(card).getByRole('button', { name: 'Coming Soon' }),
		).toBeDisabled();
	});

	it('shows a connected badge and disconnect button', () => {
		render(
			<IntegrationCard
				{...baseProps}
				status="connected"
				onDisconnect={vi.fn()}
			/>,
		);

		const card = screen.getByRole('region', { name: 'Google Calendar' });

		expect(
			within(card).getByRole('status', { name: 'Connected' }),
		).toBeInTheDocument();
		expect(
			within(card).getByRole('button', { name: 'Disconnect' }),
		).toBeInTheDocument();
	});

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

	it('shows the loading connect button name while connecting', () => {
		render(
			<IntegrationCard
				{...baseProps}
				status="available"
				onConnect={vi.fn()}
				loading={true}
			/>,
		);

		const card = screen.getByRole('region', { name: 'Google Calendar' });

		expect(
			within(card).getByRole('button', { name: 'Connecting…' }),
		).toBeDisabled();
	});

	it('shows the loading disconnect button name while disconnecting', () => {
		render(
			<IntegrationCard
				{...baseProps}
				status="connected"
				onDisconnect={vi.fn()}
				loading={true}
			/>,
		);

		const card = screen.getByRole('region', { name: 'Google Calendar' });

		expect(
			within(card).getByRole('button', { name: 'Disconnecting…' }),
		).toBeDisabled();
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
