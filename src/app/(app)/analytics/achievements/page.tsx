import type { Metadata } from 'next';

import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import { BookOpen, Flame, Star, Target, Trophy, Zap } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Achievements | Atlaris',
  description: 'Milestones from plan progress, streaks, and consistency.',
  openGraph: {
    title: 'Achievements | Atlaris',
    description: 'Milestones from plan progress, streaks, and consistency.',
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
        subtitle='Milestones from plan progress — tracking ships soon.'
      />

      <section aria-labelledby='achievements-coming-soon-heading'>
        <Surface className='relative mx-auto max-w-3xl overflow-hidden'>
          <p
            id='achievements-coming-soon-heading'
            className='text-base font-medium text-foreground'
          >
            Coming soon
          </p>
          <p className='mt-1 max-w-md text-sm text-muted-foreground'>
            Achievement tracking isn&apos;t available yet. These milestones are
            a preview of what&apos;s ahead.
          </p>
          <ul
            className='mt-6 grid gap-x-6 gap-y-4 opacity-50 sm:grid-cols-2'
            aria-hidden='true'
          >
            {ACHIEVEMENTS.map((achievement) => (
              <li key={achievement.name} className='flex items-start gap-3'>
                <span className='flex size-8 shrink-0 items-center justify-center rounded-md bg-panel-muted'>
                  {achievement.icon}
                </span>
                <div className='min-w-0'>
                  <p className='text-sm font-medium text-foreground'>
                    {achievement.name}
                  </p>
                  <p className='mt-0.5 text-sm text-muted-foreground'>
                    {achievement.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Surface>
      </section>
    </>
  );
}
