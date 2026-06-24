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

export default function AchievementsPage() {
  return (
    <>
      <PageHeader
        title='Achievements'
        subtitle='Badges and milestones based on your actual learning activity'
      />

      <ComingSoonAlert
        title='Achievements preview'
        description='Badges stay locked until they can be earned from real plan progress.'
        icon={Trophy}
        className='mb-6'
      />

      <Card className='max-w-3xl'>
        <CardHeader>
          <CardTitle as='h3'>Milestones that will unlock</CardTitle>
          <CardDescription>
            Earned badges will appear here after completion, streak, and
            consistency tracking ships.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className='grid gap-4 sm:grid-cols-2'>
            {ACHIEVEMENTS.map((achievement) => (
              <li key={achievement.name} className='flex gap-3'>
                <span
                  className='flex size-10 shrink-0 items-center justify-center rounded-md bg-muted'
                  aria-hidden='true'
                >
                  {achievement.icon}
                </span>
                <div className='min-w-0'>
                  <h3 className='font-medium text-foreground'>
                    {achievement.name}
                  </h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {achievement.description}
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
