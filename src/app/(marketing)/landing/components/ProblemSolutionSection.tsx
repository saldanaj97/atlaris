import type { ReactNode } from 'react';

import { MarketingCard } from '@/app/(marketing)/_shared/MarketingCard';
import { MarketingSection } from '@/app/(marketing)/_shared/MarketingSection';
import { ArrowDownCircle, Calendar, Check, X } from 'lucide-react';
import { useId } from 'react';

export function ProblemSolutionSection() {
  const sectionId = useId();
  const headingId = `${sectionId}-heading`;
  const problemCardHeadingId = `${sectionId}-problem-card-heading`;
  const solutionCardHeadingId = `${sectionId}-solution-card-heading`;

  return (
    <MarketingSection
      headingId={headingId}
      badge='The Challenge'
      badgeClassName='bg-destructive/10 text-destructive'
      title="Most people don't fail to learn. They fail to start."
    >
      <div className='grid gap-8 md:grid-cols-2'>
        <section aria-labelledby={problemCardHeadingId}>
          <MarketingCard variant='destructive' className='p-8'>
            <div className='mb-6 flex items-center gap-4'>
              <div className='flex size-12 items-center justify-center rounded-2xl bg-linear-to-br from-destructive to-destructive/80 shadow-lg'>
                <ArrowDownCircle
                  className='size-6 text-white'
                  aria-hidden='true'
                />
              </div>
              <h3 id={problemCardHeadingId} className='marketing-card-title'>
                The Manual Spiral
              </h3>
            </div>

            <ul className='space-y-4'>
              <ProblemItem>
                Endless searches across YouTube, blogs, and courses
              </ProblemItem>
              <ProblemItem>
                Conflicting advice from different sources
              </ProblemItem>
              <ProblemItem>
                Plans that never become a concrete weekly routine
              </ProblemItem>
              <ProblemItem>Motivation dies by week two</ProblemItem>
            </ul>
          </MarketingCard>
        </section>

        <section aria-labelledby={solutionCardHeadingId}>
          <MarketingCard variant='primary' className='p-8'>
            <div className='mb-6 flex items-center gap-4'>
              <div className='flex size-12 items-center justify-center rounded-2xl bg-linear-to-br from-primary to-accent shadow-lg'>
                <Calendar className='size-6 text-white' aria-hidden='true' />
              </div>
              <h3 id={solutionCardHeadingId} className='marketing-card-title'>
                Execution, Scheduled
              </h3>
            </div>

            <ul className='space-y-4'>
              <SolutionItem>Coherent roadmap from day one</SolutionItem>
              <SolutionItem>
                Time-blocked into a realistic weekly plan
              </SolutionItem>
              <SolutionItem>Resources attached to every session</SolutionItem>
              <SolutionItem>Progress visible at a glance</SolutionItem>
            </ul>
          </MarketingCard>
        </section>
      </div>
    </MarketingSection>
  );
}

interface ItemProps {
  children: ReactNode;
}

function ProblemItem({ children }: ItemProps) {
  return (
    <li className='flex items-start gap-3'>
      <div className='mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-destructive/10 shadow-sm'>
        <X className='size-3.5 text-destructive' aria-hidden='true' />
      </div>
      <span className='leading-relaxed text-muted-foreground'>{children}</span>
    </li>
  );
}

function SolutionItem({ children }: ItemProps) {
  return (
    <li className='flex items-start gap-3'>
      <div className='mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 shadow-sm'>
        <Check className='size-3.5 text-primary' aria-hidden='true' />
      </div>
      <span className='leading-relaxed text-muted-foreground'>{children}</span>
    </li>
  );
}
