'use client';

import type { JSX } from 'react';

import type { IntegrationCardProps } from './IntegrationCard';
import { IntegrationCard } from './IntegrationCard';

type IntegrationDef = Omit<IntegrationCardProps, 'onConnect' | 'loading'> & {
	id: string;
};

const INTEGRATIONS: IntegrationDef[] = [
	{
		id: 'google_calendar',
		name: 'Google Calendar',
		icon: '📅',
		status: 'coming_soon',
		description:
			'Google Calendar integration is on hold for now. We will bring it back later with a cleaner, more deliberate implementation.',
		features: [
			'Auto-sync study sessions',
			'Smart reminders',
			'Time-block scheduling',
			'Calendar conflict detection',
		],
	},
	{
		id: 'slack',
		name: 'Slack',
		icon: '💬',
		status: 'coming_soon',
		description:
			'Get learning reminders and progress updates directly in your Slack workspace.',
		features: [
			'Daily learning reminders',
			'Progress notifications',
			'Team learning channels',
			'Bot commands',
		],
	},
	{
		id: 'todoist',
		name: 'Todoist',
		icon: '✅',
		status: 'coming_soon',
		description:
			'Turn your learning tasks into Todoist tasks. Track study sessions alongside your daily to-dos.',
		features: [
			'Task sync',
			'Priority mapping',
			'Due date alignment',
			'Project organization',
		],
	},
	{
		id: 'zapier',
		name: 'Zapier',
		icon: '⚡',
		status: 'coming_soon',
		description:
			'Connect Atlaris to 5,000+ apps through Zapier automations. Build custom workflows for your learning.',
		features: [
			'5,000+ app connections',
			'Custom triggers',
			'Multi-step workflows',
			'Webhook support',
		],
	},
];

export function IntegrationGrid(): JSX.Element {
	return (
		<div className="grid gap-6 md:grid-cols-2">
			{INTEGRATIONS.map((def) => (
				<IntegrationCard
					key={def.id}
					name={def.name}
					description={def.description}
					icon={def.icon}
					features={def.features}
					status={def.status}
				/>
			))}
		</div>
	);
}
