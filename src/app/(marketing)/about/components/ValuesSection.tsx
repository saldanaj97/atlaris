import { Eye, Globe, Target } from 'lucide-react';
import type { JSX, ReactNode } from 'react';
import { useId } from 'react';

import { Card } from '@/components/ui/card';

import { MarketingSectionLayout } from './MarketingSectionLayout';

/**
 * Core values section with glassmorphism cards.
 */
export function ValuesSection(): JSX.Element {
  const headingId = useId();

  return (
    <MarketingSectionLayout
      headingId={headingId}
      title={
        <>
          What We <span className="gradient-text">Believe</span>
        </>
      }
      subtitle="The principles that guide every feature we build."
    >
      <div className="grid gap-6 md:grid-cols-3">
        {VALUES.map((value) => (
          <Card
            key={value.title}
            className="group relative overflow-hidden rounded-3xl border border-white/50 bg-white/40 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl dark:border-white/10 dark:bg-card/40"
          >
            <div
              className="gradient-glow absolute -top-12 -right-12 h-32 w-32 opacity-30"
              aria-hidden="true"
            />

            <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl shadow-lg">
              {value.icon}
            </div>
            <h3 className="marketing-h3 mb-3 text-foreground">{value.title}</h3>
            <p className="leading-relaxed text-muted-foreground">
              {value.description}
            </p>
          </Card>
        ))}
      </div>
    </MarketingSectionLayout>
  );
}

interface Value {
  icon: ReactNode;
  title: string;
  description: string;
}

const VALUES: Value[] = [
  {
    icon: <Eye className="h-6 w-6 text-white" aria-hidden="true" />,
    title: 'Clarity',
    description:
      "Learning shouldn't feel chaotic. We strip away noise and give you a crystal-clear path from where you are to where you want to be.",
  },
  {
    icon: <Target className="h-6 w-6 text-white" aria-hidden="true" />,
    title: 'Personalization',
    description:
      'No two learners are the same. Every plan is tailored to your goals, schedule, and preferred learning style.',
  },
  {
    icon: <Globe className="h-6 w-6 text-white" aria-hidden="true" />,
    title: 'Accessibility',
    description:
      'Great education should be available to everyone. We curate free and open resources alongside premium content.',
  },
];
