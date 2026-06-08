import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { ComingSoonAlert } from '@/components/shared/ComingSoonAlert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { BellRing, BookOpen, Clock, CreditCard } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Notifications',
  description: 'Manage your notification preferences.',
};

function LockedNotificationRow({ label }: { label: string }): ReactElement {
  return (
    <div className='flex items-center justify-between py-2'>
      <span className='text-sm text-muted-foreground'>{label}</span>
      <Badge variant='outline' className='text-xs font-normal'>
        Coming soon
      </Badge>
    </div>
  );
}

export default function NotificationsSettingsPage(): ReactElement {
  return (
    <>
      <PageHeader
        title='Notifications'
        subtitle='Manage how you stay informed about your learning progress and account activity'
      />

      <ComingSoonAlert
        title='Personalized alerts are on the way'
        description="We're building notification preferences so you can choose how and when you receive updates about your learning and account."
        icon={BellRing}
        className='mb-6'
      />

      <div className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
        <Card className='p-6'>
          <div className='mb-4 flex items-center gap-3'>
            <Clock className='size-5 text-muted-foreground' />
            <h3 className='text-xl font-semibold'>Learning reminders</h3>
          </div>
          <p className='mb-4 text-sm text-muted-foreground'>
            Daily and weekly nudges to help you keep a consistent study rhythm.
          </p>
          <div className='divide-y divide-border'>
            <LockedNotificationRow label='Daily study reminder' />
            <LockedNotificationRow label='Weekly progress summary' />
            <LockedNotificationRow label='Streak at risk' />
          </div>
        </Card>

        <Card className='p-6'>
          <div className='mb-4 flex items-center gap-3'>
            <BookOpen className='size-5 text-muted-foreground' />
            <h3 className='text-xl font-semibold'>Plan updates</h3>
          </div>
          <p className='mb-4 text-sm text-muted-foreground'>
            Alerts when plans finish generating or new lesson resources are
            ready.
          </p>
          <div className='divide-y divide-border'>
            <LockedNotificationRow label='Plan generation complete' />
            <LockedNotificationRow label='New resources available' />
            <LockedNotificationRow label='Module milestones' />
          </div>
        </Card>

        <Card className='p-6'>
          <div className='mb-4 flex items-center gap-3'>
            <CreditCard className='size-5 text-muted-foreground' />
            <h3 className='text-xl font-semibold'>Account & billing</h3>
          </div>
          <p className='mb-4 text-sm text-muted-foreground'>
            Updates about subscription changes, usage limits, and account
            security.
          </p>
          <div className='divide-y divide-border'>
            <LockedNotificationRow label='Subscription changes' />
            <LockedNotificationRow label='Usage limit warnings' />
            <LockedNotificationRow label='Security alerts' />
          </div>
        </Card>
      </div>
    </>
  );
}
