import { BarChart3, Clock, Flame, Target } from 'lucide-react';
import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ComingSoonAlert } from '@/components/shared/ComingSoonAlert';
import { LockedFeatureCard } from '@/components/ui/locked-feature-card';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';

export const metadata: Metadata = {
  title: 'Usage Analytics | Atlaris',
  description:
    'Track your learning progress with detailed usage analytics — study time, completion rates, streaks, and more.',
  openGraph: {
    title: 'Usage Analytics | Atlaris',
    description:
      'Track your learning progress with detailed usage analytics — study time, completion rates, streaks, and more.',
    url: '/analytics/usage',
    images: ['/og-default.jpg'],
  },
};

const iconClass = 'text-primary h-8 w-8 shrink-0';

const PREVIEW_CARDS = [
  {
    icon: <Clock className={iconClass} aria-hidden />,
    title: 'Study Time Tracking',
    description:
      'See exactly how many hours you spend learning each week. Spot your most productive days and find your ideal study rhythm.',
  },
  {
    icon: <Target className={iconClass} aria-hidden />,
    title: 'Completion Rates',
    description:
      "Track your progress across every plan. Know which topics you're crushing and where you might need a little more focus.",
  },
  {
    icon: <Flame className={iconClass} aria-hidden />,
    title: 'Learning Streaks',
    description:
      'Build consistency with daily and weekly streak tracking. Small wins compound — watch your momentum grow.',
  },
  {
    icon: <BarChart3 className={iconClass} aria-hidden />,
    title: 'Weekly Reports',
    description:
      'Get a clear snapshot of your week — time invested, milestones hit, and personalized suggestions for what to tackle next.',
  },
];

export default function UsageAnalyticsPage(): JSX.Element {
  return (
    <PageShell>
      <PageHeader
        title="Usage"
        subtitle="Understand how you learn, so you can learn even better"
      />

      <ComingSoonAlert
        title="We're building something special"
        description="Usage analytics will give you a clear picture of your learning habits and progress. We're putting the finishing touches on it — we'll let you know when it's ready."
        className="mb-6"
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PREVIEW_CARDS.map((card) => (
          <LockedFeatureCard
            key={card.title}
            icon={card.icon}
            title={card.title}
            description={card.description}
          />
        ))}
      </div>
    </PageShell>
  );
}
