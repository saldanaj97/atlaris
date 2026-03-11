import type { JSX } from 'react';

import type { IntegrationCardProps } from './IntegrationCard';

import { IntegrationCard } from './IntegrationCard';

const INTEGRATIONS: IntegrationCardProps[] = [
  {
    name: 'Google Calendar',
    icon: '📅',
    status: 'available',
    description:
      'Automatically sync your learning schedule to Google Calendar. Get reminders for upcoming study sessions and keep your learning on track.',
    features: [
      'Auto-sync study sessions',
      'Smart reminders',
      'Time-block scheduling',
      'Calendar conflict detection',
    ],
    // TODO: Wire to Google Calendar OAuth flow in src/lib/integrations/
  },
  {
    name: 'CSV Export',
    icon: '📊',
    status: 'available',
    description:
      'Download your learning plans and progress data as CSV files for spreadsheet analysis or sharing.',
    features: [
      'Plan data export',
      'Progress history',
      'Custom date ranges',
      'Bulk export',
    ],
    // TODO: Implement CSV download endpoint
  },
  {
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
      {INTEGRATIONS.map((integration) => (
        <IntegrationCard key={integration.name} {...integration} />
      ))}
    </div>
  );
}
