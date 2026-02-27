import type { Metadata } from 'next';
import type { JSX } from 'react';

import { BookOpen, Flame, Lock, Star, Target, Trophy, Zap } from 'lucide-react';

import { ComingSoonAlert } from '@/components/shared/ComingSoonAlert';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export const metadata: Metadata = {
  title: 'Achievements | Atlaris',
  description: 'Celebrate your learning milestones and unlock badges.',
  openGraph: {
    title: 'Achievements | Atlaris',
    description: 'Celebrate your learning milestones and unlock badges.',
    url: '/analytics/achievements',
    images: ['/og-default.jpg'],
  },
};

const ACHIEVEMENTS = [
  {
    icon: Trophy,
    name: 'First Steps',
    description:
      'Complete your first learning plan and kickstart your growth journey.',
  },
  {
    icon: Flame,
    name: 'Streak Master',
    description:
      'Maintain a daily learning streak and build unstoppable momentum.',
  },
  {
    icon: BookOpen,
    name: 'Knowledge Seeker',
    description:
      'Complete multiple modules and expand your expertise across topics.',
  },
  {
    icon: Zap,
    name: 'Speed Learner',
    description:
      'Finish plans ahead of schedule and prove you thrive under pressure.',
  },
  {
    icon: Star,
    name: 'Consistency King',
    description: 'Log regular weekly study sessions and make learning a habit.',
  },
  {
    icon: Target,
    name: 'Goal Crusher',
    description:
      'Hit every learning target you set and master the art of follow-through.',
  },
] as const;

export default function AchievementsPage(): JSX.Element {
  return (
    <div className="mx-auto min-h-screen max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1>Achievements</h1>
        <p className="subtitle">
          Celebrate every milestone on your learning journey
        </p>
      </header>

      <ComingSoonAlert
        title="Your achievements are being crafted."
        description="Earn badges, track milestones, and showcase your progress — launching soon."
        icon={Trophy}
        className="mb-8"
      />

      {/* Achievement preview grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {ACHIEVEMENTS.map((achievement) => (
          <Card key={achievement.name} className="group relative rounded-2xl">
            <CardContent>
              {/* Lock overlay */}
              <div className="absolute top-4 right-4">
                <Lock className="text-muted-foreground/60 h-4 w-4" />
              </div>

              <div className="flex flex-col gap-3 opacity-50">
                <achievement.icon className="text-primary h-8 w-8" />
                <div>
                  <h3 className="font-medium">{achievement.name}</h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {achievement.description}
                  </p>
                </div>
              </div>

              {/* Locked progress bar */}
              <Progress value={0} className="mt-4 h-1.5" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
