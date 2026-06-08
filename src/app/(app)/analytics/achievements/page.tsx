import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ComingSoonAlert } from '@/components/shared/ComingSoonAlert';
import { LockedFeatureCard } from '@/components/ui/locked-feature-card';
import { PageHeader } from '@/components/ui/page-header';
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

const iconClass = 'text-primary size-8 shrink-0';

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

export default function AchievementsPage(): JSX.Element {
  return (
    <>
      <PageHeader
        title='Achievements'
        subtitle='Badges and milestones based on your actual learning activity'
      />

      <ComingSoonAlert
        title='Achievements are in development'
        description='You will earn badges as you complete plans, maintain streaks, and hit milestones. We will notify you when this page goes live.'
        icon={Trophy}
        className='mb-6'
      />

      <div className='grid gap-6 sm:grid-cols-2 lg:grid-cols-3'>
        {ACHIEVEMENTS.map((achievement) => (
          <LockedFeatureCard
            key={achievement.name}
            icon={achievement.icon}
            title={achievement.name}
            description={achievement.description}
          />
        ))}
      </div>
    </>
  );
}
