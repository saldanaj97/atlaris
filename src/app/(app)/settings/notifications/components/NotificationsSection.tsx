import { LedgerRow } from '@/app/(app)/settings/components/LedgerPrimitives';
import { Badge } from '@/components/ui/badge';

const NOTIFICATION_CATEGORIES = [
  {
    title: 'Learning reminders',
    description:
      'Daily and weekly nudges, progress summaries, and streak alerts when personalized notifications launch.',
  },
  {
    title: 'Plan updates',
    description:
      'Alerts when plans finish generating, new resources are ready, or you hit module milestones.',
  },
  {
    title: 'Account & billing',
    description:
      'Updates about subscription changes, usage limits, and account security events.',
  },
] as const;

export function NotificationsSection() {
  return (
    <>
      {NOTIFICATION_CATEGORIES.map((category) => (
        <LedgerRow
          key={category.title}
          label={category.title}
          hint={category.description}
        >
          <Badge variant='outline'>Coming soon</Badge>
        </LedgerRow>
      ))}
    </>
  );
}
