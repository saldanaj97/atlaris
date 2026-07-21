import type { Metadata } from 'next';

import { ledgerGlassSurface } from '@/app/(app)/settings/components/LedgerPrimitives';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';
import { BookOpen, Flame, Star, Target, Trophy, Zap } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Achievements | Atlaris',
  description: 'Track learning milestones and unlock badges as you progress.',
  openGraph: {
    title: 'Achievements | Atlaris',
    description: 'Track learning milestones and unlock badges as you progress.',
    url: '/analytics/achievements',
    images: ['/og-default.jpg'],
  },
};

const iconClass = 'size-5 shrink-0 text-primary';

const ACHIEVEMENTS = [
  {
    icon: <Trophy className={iconClass} aria-hidden />,
    name: 'First plan complete',
    description: 'Finish your first learning plan from start to finish.',
  },
  {
    icon: <Flame className={iconClass} aria-hidden />,
    name: 'Seven-day streak',
    description: 'Study on seven consecutive days within the same plan.',
  },
  {
    icon: <BookOpen className={iconClass} aria-hidden />,
    name: 'Module milestone',
    description: 'Complete five modules across any of your active plans.',
  },
  {
    icon: <Zap className={iconClass} aria-hidden />,
    name: 'Ahead of schedule',
    description: 'Finish a plan before its estimated completion date.',
  },
  {
    icon: <Star className={iconClass} aria-hidden />,
    name: 'Weekly consistency',
    description: 'Log study activity in four separate weeks during a month.',
  },
  {
    icon: <Target className={iconClass} aria-hidden />,
    name: 'Goal met',
    description: 'Complete every task in a plan you set as your primary focus.',
  },
];

export default function AchievementsPage() {
  return (
    <>
      <PageHeader
        title='Achievements'
        subtitle='Badges unlock from plan progress, streaks, and consistency — tracking ships soon.'
      />

      <section
        aria-labelledby='upcoming-milestones-heading'
        className={cn('max-w-3xl px-5 py-7 sm:px-7', ledgerGlassSurface)}
      >
        <h2
          id='upcoming-milestones-heading'
          className='text-base font-medium text-foreground'
        >
          Upcoming milestones
        </h2>
        <ul className='mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2'>
          {ACHIEVEMENTS.map((achievement) => (
            <li key={achievement.name} className='flex items-start gap-3'>
              <span
                className='flex size-8 shrink-0 items-center justify-center rounded-md bg-panel-muted'
                aria-hidden='true'
              >
                {achievement.icon}
              </span>
              <div className='min-w-0'>
                <h3 className='text-sm font-medium text-foreground'>
                  {achievement.name}
                </h3>
                <p className='mt-0.5 text-sm text-muted-foreground'>
                  {achievement.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
