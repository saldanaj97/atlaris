import type { MarketingCreatePlanCta } from '@/features/navigation';

import { RevealAnimation } from './RevealAnimation';
import { RoadmapPreview } from './RoadmapPreview';
import { marketingPrimaryCtaClassName } from '@/app/(landing)/_shared/marketing-cta';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BarChart3, Clock, Sparkles } from 'lucide-react';
import Link from 'next/link';

import styles from './landing.module.css';

/** What a plan from Atlaris contains. Each line states a shipped behavior. */
const CAPABILITIES = [
  {
    title: 'Modules and tasks sized to your hours',
    copy: 'Each task carries a time estimate, so each module fits the hours you set.',
    icon: Clock,
  },
  {
    title: 'Lessons as you go',
    copy: 'Atlaris writes lessons for your first modules when the plan is ready, then for the next ones as you work through it.',
    icon: Sparkles,
  },
  {
    title: 'Progress you can see',
    copy: 'Mark tasks done. Every plan shows its percent complete.',
    icon: BarChart3,
  },
] as const;

/** What the plan leaves to you; adapted from the retired About page's method section. */
const LEAVES_TO_YOU = [
  'It doesn’t grade you.',
  'It doesn’t punish a missed week. The plan waits, and nothing expires.',
  'It’s a map, not the walk. If a step is wrong for you, skip it.',
] as const;

/** What a plan contains, beside a themed copy of the plan page. */
export function PlanContentsSection({
  createPlanCta,
}: {
  createPlanCta: MarketingCreatePlanCta;
}) {
  return (
    // box-content: the 7xl cap applies inside the gutter, so the content lines
    // up with the CTA card below, which is 7xl wide inside the same gutter.
    <section
      className='mx-auto box-content max-w-7xl px-6 pb-16 md:px-8 md:pb-24'
      aria-labelledby='landing-plan-heading'
    >
      <RevealAnimation>
        {/* oxlint-disable shadcn/require-static-classes -- imported CSS module and shared CTA classes are complete but opaque to the rule */}
        <div className='grid items-center gap-12 border-t border-border pt-16 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-14 md:pt-24 lg:gap-20'>
          <div className={styles.revealItem}>
            <h2
              id='landing-plan-heading'
              className='max-w-[18ch] type-display-section text-balance text-foreground'
            >
              What&apos;s inside a plan
            </h2>
            <ul className='mt-8 space-y-6'>
              {CAPABILITIES.map(({ title, copy, icon: Icon }) => (
                <li key={title} className='flex items-start gap-3'>
                  <span className='grid size-9 shrink-0 place-items-center rounded-xl border border-border/60 bg-card/70 text-primary'>
                    <Icon className='size-4' aria-hidden='true' />
                  </span>
                  <span>
                    <span className='block type-label font-semibold text-foreground'>
                      {title}
                    </span>
                    <span className='mt-1 block max-w-md type-body text-muted-foreground'>
                      {copy}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <h3 className='mt-10 type-label font-semibold text-foreground'>
              And what it won&apos;t do
            </h3>
            <ul className='mt-3 max-w-md space-y-2 type-body text-muted-foreground'>
              {LEAVES_TO_YOU.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <Button
              asChild
              className={cn('mt-9', marketingPrimaryCtaClassName)}
            >
              <Link href={createPlanCta.href}>{createPlanCta.label}</Link>
            </Button>
          </div>

          <figure
            className={cn(
              'relative flex aspect-[4/5] w-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-2 shadow-xl shadow-black/10 sm:aspect-[4/3] sm:p-3',
              styles.previewFrame,
              styles.revealItem,
            )}
          >
            <p className='px-2 pt-1 pb-2 type-eyebrow text-muted-foreground'>
              Example plan · illustrative data
            </p>
            {/* A themed copy of the plan page, laid out wider and scaled to 60%
                so the route fits; the caption describes it. */}
            <div
              aria-hidden='true'
              inert
              className='min-h-0 flex-1 overflow-hidden rounded-2xl bg-background mask-b-from-80% select-none'
            >
              <div className='w-[calc(100%/0.6)] origin-top-left scale-60 p-5 sm:p-6'>
                <RoadmapPreview />
              </div>
            </div>
            <figcaption className='sr-only'>
              Illustrative plan example showing ordered modules, the current
              module's tasks and plan progress.
            </figcaption>
          </figure>
        </div>
        {/* oxlint-enable shadcn/require-static-classes */}
      </RevealAnimation>
    </section>
  );
}
