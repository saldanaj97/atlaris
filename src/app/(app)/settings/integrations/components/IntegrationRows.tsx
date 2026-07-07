import { LedgerRow } from '@/app/(app)/settings/components/LedgerPrimitives';
import { Badge } from '@/components/ui/badge';

const INTEGRATIONS = [
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    description:
      'Google Calendar integration is on hold for now. We will bring it back later with a cleaner, more deliberate implementation.',
  },
  {
    id: 'slack',
    name: 'Slack',
    description:
      'Get learning reminders and progress updates directly in your Slack workspace.',
  },
  {
    id: 'todoist',
    name: 'Todoist',
    description:
      'Turn your learning tasks into Todoist tasks. Track study sessions alongside your daily to-dos.',
  },
  {
    id: 'zapier',
    name: 'Zapier',
    description:
      'Connect Atlaris to 5,000+ apps through Zapier automations. Build custom workflows for your learning.',
  },
] as const;

export function IntegrationRows() {
  return (
    <>
      {INTEGRATIONS.map((integration) => (
        <LedgerRow
          key={integration.id}
          label={integration.name}
          hint={integration.description}
        >
          <Badge variant='secondary'>Coming soon</Badge>
        </LedgerRow>
      ))}
    </>
  );
}
