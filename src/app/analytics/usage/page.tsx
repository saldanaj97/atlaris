import {
  BarChart3,
  Clock,
  Flame,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import type { Metadata } from 'next';
import type { JSX } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';

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
        <h1>Usage Analytics</h1>
        <p className="subtitle">
          Understand how you learn, so you can learn even better
        </p>
      </header>

      {/* Coming soon callout */}
      <Alert className="mb-10">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        <AlertTitle className="flex items-center gap-2">
          We&apos;re building something special
          <TrendingUp className="text-primary h-4 w-4" aria-hidden="true" />
        </AlertTitle>
        <AlertDescription>
          Usage analytics will give you a clear picture of your learning habits
          and progress. We&apos;re putting the finishing touches on it&nbsp;—
          we&apos;ll let you know when it&apos;s ready.
        </AlertDescription>
      </Alert>

      {/* Preview cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {PREVIEW_CARDS.map((card) => (
          <Card
            key={card.title}
            className="pointer-events-none opacity-60 transition-none select-none"
          >
            <CardContent className="space-y-3">
              <div className="bg-muted/50 text-muted-foreground w-fit rounded-lg p-2.5">
                <card.icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-foreground font-medium">{card.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {card.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
