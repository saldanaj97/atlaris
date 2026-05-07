import { CalendarDays, Library, Sparkles } from 'lucide-react';
import type { JSX, ReactNode } from 'react';
import { useId } from 'react';

import { Card } from '@/components/ui/card';

import { MarketingSectionLayout } from './MarketingSectionLayout';

/**
 * Mission section explaining what Atlaris does.
 */
export function MissionSection(): JSX.Element {
  const headingId = useId();

  return (
    <MarketingSectionLayout
      headingId={headingId}
      title={
        <>
          Our <span className="gradient-text">Mission</span>
        </>
      }
      subtitle="Bridging the gap between ambition and execution."
    >
      <div className="grid items-center gap-8 md:grid-cols-2">
        <div>
          <p className="mb-4 text-lg leading-relaxed text-muted-foreground">
            Most people know <em>what</em> they want to learn but struggle with{' '}
            <em>how</em> to get there. Generic courses and scattered resources
            leave learners overwhelmed and without direction.
          </p>
          <p className="text-lg leading-relaxed text-muted-foreground">
            Atlaris transforms your learning goals into structured, time-blocked
            plans tailored to your schedule. Our AI analyzes thousands of
            resources, curates the best ones, and maps out a day-by-day path —
            synced directly to your calendar so nothing falls through the
            cracks.
          </p>
        </div>

        <Card className="relative overflow-hidden rounded-3xl border border-white/50 bg-white/40 p-8 shadow-xl backdrop-blur-sm dark:border-white/10 dark:bg-card/40">
          <div
            className="gradient-glow absolute -top-12 -right-12 h-32 w-32 opacity-30"
            aria-hidden="true"
          />

          <div className="space-y-6">
            {HIGHLIGHTS.map((item) => (
              <div key={item.title} className="flex items-start gap-4">
                <div className="gradient-brand inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl shadow-lg">
                  {item.icon}
                </div>
                <div>
                  <h3 className="marketing-h3 mb-1 text-foreground">
                    {item.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </MarketingSectionLayout>
  );
}

interface Highlight {
  icon: ReactNode;
  title: string;
  description: string;
}

const HIGHLIGHTS: Highlight[] = [
  {
    icon: <Sparkles className="h-5 w-5 text-white" aria-hidden="true" />,
    title: 'AI-Powered Plans',
    description:
      'Intelligent scheduling that adapts to your pace, goals, and availability.',
  },
  {
    icon: <CalendarDays className="h-5 w-5 text-white" aria-hidden="true" />,
    title: 'Calendar Sync',
    description:
      'Plans sync directly to Google Calendar so learning fits your life.',
  },
  {
    icon: <Library className="h-5 w-5 text-white" aria-hidden="true" />,
    title: 'Curated Resources',
    description:
      'Top-ranked videos, articles, and docs selected for each topic.',
  },
];
