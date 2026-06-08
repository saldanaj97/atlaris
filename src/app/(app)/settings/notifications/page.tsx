import type { Metadata } from 'next';

import { ComingSoonAlert } from '@/components/shared/ComingSoonAlert';
import { LockedFeatureCard } from '@/components/ui/locked-feature-card';
import { PageHeader } from '@/components/ui/page-header';
import { BellRing, BookOpen, Clock, CreditCard } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Notifications',
  description: 'Manage your notification preferences.',
};

const iconClass = 'text-primary size-8 shrink-0';

const NOTIFICATION_CATEGORIES = [
  {
    icon: <Clock className={iconClass} aria-hidden />,
    title: 'Learning reminders',
    description:
      'Daily and weekly nudges, progress summaries, and streak alerts when personalized notifications launch.',
  },
  {
    icon: <BookOpen className={iconClass} aria-hidden />,
    title: 'Plan updates',
    description:
      'Alerts when plans finish generating, new resources are ready, or you hit module milestones.',
  },
  {
    icon: <CreditCard className={iconClass} aria-hidden />,
    title: 'Account & billing',
    description:
      'Updates about subscription changes, usage limits, and account security events.',
  },
];

export default function NotificationsSettingsPage() {
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

      <div className='grid gap-6 md:grid-cols-2'>
        {NOTIFICATION_CATEGORIES.map((category) => (
          <LockedFeatureCard
            key={category.title}
            icon={category.icon}
            title={category.title}
            description={category.description}
          />
        ))}
      </div>
    </>
  );
}
