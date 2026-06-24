import type { Metadata } from 'next';

import { ComingSoonAlert } from '@/components/shared/ComingSoonAlert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
        title='Usage analytics preview'
        description='Live charts stay hidden until plan activity is connected, so this page only shows what will unlock.'
        className='mb-6'
      />

      <Card className='max-w-3xl'>
        <CardHeader>
          <CardTitle as='h3'>Progress signals coming here</CardTitle>
          <CardDescription>
            Unlocks when study sessions and module activity start feeding the
            analytics pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className='grid gap-4 sm:grid-cols-2'>
            {PREVIEW_CARDS.map((card) => (
              <li key={card.title} className='flex gap-3'>
                <span
                  className='flex size-10 shrink-0 items-center justify-center rounded-md bg-muted'
                  aria-hidden='true'
                >
                  {card.icon}
                </span>
                <div className='min-w-0'>
                  <h3 className='font-medium text-foreground'>{card.title}</h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {card.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
