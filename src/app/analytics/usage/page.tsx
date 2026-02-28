import type { Metadata } from 'next';
import type { JSX } from 'react';

import { BarChart3, Clock, Flame, Lock, Target } from 'lucide-react';

import { ComingSoonAlert } from '@/components/shared/ComingSoonAlert';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

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

const PREVIEW_CARDS = [
  {
    icon: Clock,
    title: 'Study Time Tracking',
    description:
      'See exactly how many hours you spend learning each week. Spot your most productive days and find your ideal study rhythm.',
  },
  {
    icon: Target,
    title: 'Completion Rates',
    description:
      "Track your progress across every plan. Know which topics you're crushing and where you might need a little more focus.",
  },
  {
    icon: Flame,
    title: 'Learning Streaks',
    description:
      'Build consistency with daily and weekly streak tracking. Small wins compound — watch your momentum grow.',
  },
  {
    icon: BarChart3,
    title: 'Weekly Reports',
    description:
      'Get a clear snapshot of your week — time invested, milestones hit, and personalized suggestions for what to tackle next.',
  },
] as const;

export default function UsageAnalyticsPage(): JSX.Element {
  return (
    <div className="mx-auto min-h-screen max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1>Usage</h1>
        <p className="subtitle">
          Understand how you learn, so you can learn even better
        </p>
      </header>

      <ComingSoonAlert
        title="We're building something special"
        description="Usage analytics will give you a clear picture of your learning habits and progress. We're putting the finishing touches on it — we'll let you know when it's ready."
        className="mb-10"
      />

      {/* Preview cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {PREVIEW_CARDS.map((card) => (
          <Card key={card.title} className="group relative rounded-2xl">
            <CardContent>
              {/* Lock overlay */}
              <div className="absolute top-4 right-4">
                <Lock className="text-muted-foreground/60 h-4 w-4" />
              </div>

              <div className="flex flex-col gap-3 opacity-50">
                <card.icon
                  className="text-primary h-8 w-8"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="font-medium">{card.title}</h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {card.description}
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
