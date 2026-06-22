import type { ReactNode } from 'react';

import { MarketingCard } from '@/app/(marketing)/_shared/MarketingCard';
import { MarketingSection } from '@/app/(marketing)/_shared/MarketingSection';
import { CalendarDays, Library, Sparkles } from 'lucide-react';
import { useId } from 'react';

export function MissionSection() {
  const headingId = useId();

  return (
    <MarketingSection
      headingId={headingId}
      title='Our Mission'
      subtitle='Bridging the gap between ambition and execution.'
    >
      <div className='grid items-center gap-8 md:grid-cols-2'>
        <div>
          <p className='mb-4 text-lg leading-relaxed text-muted-foreground'>
            Most people know <em>what</em> they want to learn but struggle with{' '}
            <em>how</em> to get there. Generic courses and scattered resources
            leave learners overwhelmed and without direction.
          </p>
          <p className='text-lg leading-relaxed text-muted-foreground'>
            Atlaris transforms your learning goals into structured plans that
            build momentum. We generate focused modules, attach curated
            resources to each lesson, and make progress visible so learning does
            not stall after week one.
          </p>
        </div>

        <MarketingCard>
          <div className='space-y-6'>
            {HIGHLIGHTS.map((item) => (
              <div key={item.title} className='flex items-start gap-4'>
                <div className='brand-fill-interactive inline-flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-lg'>
                  {item.icon}
                </div>
                <div>
                  <h3 className='marketing-card-title mb-1'>{item.title}</h3>
                  <p className='text-sm leading-relaxed text-muted-foreground'>
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </MarketingCard>
      </div>
    </MarketingSection>
  );
}

interface Highlight {
  icon: ReactNode;
  title: string;
  description: string;
}

const HIGHLIGHTS: Highlight[] = [
  {
    icon: <Sparkles className='size-5 text-white' aria-hidden='true' />,
    title: 'Structured Plans',
    description:
      'Module and lesson generation sized to your weekly hours and skill level.',
  },
  {
    icon: <CalendarDays className='size-5 text-white' aria-hidden='true' />,
    title: 'Learning Momentum',
    description:
      'Clear milestones and visible progress keep each learning plan moving.',
  },
  {
    icon: <Library className='size-5 text-white' aria-hidden='true' />,
    title: 'Curated Resources',
    description:
      'Videos, articles, and exercises attached to each scheduled session.',
  },
];
