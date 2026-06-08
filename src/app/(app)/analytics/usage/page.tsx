import type { Metadata } from 'next';

import { ComingSoonAlert } from '@/components/shared/ComingSoonAlert';
import { LockedFeatureCard } from '@/components/ui/locked-feature-card';
import { PageHeader } from '@/components/ui/page-header';
import { BarChart3, Clock, Flame, Target } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Usage Analytics | Atlaris',
  description:
    'Review study time, completion rates, streaks, and weekly learning summaries.',
  openGraph: {
    title: 'Usage Analytics | Atlaris',
    description:
      'Review study time, completion rates, streaks, and weekly learning summaries.',
    url: '/analytics/usage',
    images: ['/og-default.jpg'],
  },
};

const iconClass = 'text-primary size-8 shrink-0';

const PREVIEW_CARDS = [
  {
    icon: <Clock className={iconClass} aria-hidden />,
    title: 'Study time',
    description:
      'Weekly totals and daily averages drawn from your lesson and module activity.',
  },
  {
    icon: <Target className={iconClass} aria-hidden />,
    title: 'Completion rates',
    description:
      'See task and module completion across each plan, with trends over time.',
  },
  {
    icon: <Flame className={iconClass} aria-hidden />,
    title: 'Learning streaks',
    description:
      'Track consecutive study days and spot gaps before they break your rhythm.',
  },
  {
    icon: <BarChart3 className={iconClass} aria-hidden />,
    title: 'Weekly summary',
    description:
      'A single report with time spent, modules finished, and suggested next steps.',
  },
];

export default function UsageAnalyticsPage() {
  return (
    <>
      <PageHeader
        title='Usage'
        subtitle='Metrics from your plans, modules, and study sessions'
      />

      <ComingSoonAlert
        title='Usage analytics are almost ready'
        description='We are connecting your plan activity to charts and summaries. You will see real data here once the feature ships.'
        className='mb-6'
      />

      <div className='grid gap-6 sm:grid-cols-2 lg:grid-cols-3'>
        {PREVIEW_CARDS.map((card) => (
          <LockedFeatureCard
            key={card.title}
            icon={card.icon}
            title={card.title}
            description={card.description}
          />
        ))}
      </div>
    </>
  );
}
