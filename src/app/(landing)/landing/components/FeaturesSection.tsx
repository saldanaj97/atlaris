import { RevealAnimation } from './RevealAnimation';
import { RoadmapPreview } from './RoadmapPreview';
import { marketingPrimaryCtaClassName } from '@/app/(landing)/_shared/marketing-cta';
import { Button } from '@/components/ui/button';
import { CREATE_PLAN_LABEL } from '@/features/navigation';
import { ROUTES } from '@/features/navigation/routes';
import { cn } from '@/lib/utils';
import { BarChart3, BookOpen, Clock, Sparkles } from 'lucide-react';
import Link from 'next/link';

import styles from './landing.module.css';

/** What a plan from Atlaris contains. Each line states a shipped behavior. */
const CAPABILITIES = [
  {
    title: 'Sized to your hours',
    copy: 'Set a goal, your level, weekly hours and how you like to learn: reading, video, hands-on practice or a mix. The plan splits into modules and tasks, each with a time estimate.',
    icon: Clock,
  },
  {
    title: 'Resources on the tasks',
    copy: 'Videos, articles, courses and docs, found by web research on your topic. Some tasks may come back without any.',
    icon: BookOpen,
  },
  {
    title: 'Lessons as you go',
    copy: 'Atlaris writes lessons for your first modules when the plan is ready, then for the next ones as you work through it.',
    icon: Sparkles,
  },
  {
    title: 'See how far each plan has come',
    copy: 'Mark tasks done. Every plan shows its percent complete.',
    icon: BarChart3,
  },
] as const;

/** The landing page's one feature section: what Atlaris builds, beside a plan preview. */
export function FeaturesSection() {
  return (
    <section
      className='mx-auto max-w-7xl px-4 py-16 sm:px-6 md:px-8 md:py-24'
      aria-labelledby='landing-features-heading'
    >
      <RevealAnimation>
        {/* oxlint-disable shadcn/require-static-classes -- imported CSS module and shared CTA classes are complete but opaque to the rule */}
        <div className='grid items-center gap-12 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-14 lg:gap-20'>
          <div className={styles.revealFromLeft}>
            <h2
              id='landing-features-heading'
              className='max-w-[18ch] type-display-section text-balance text-foreground'
            >
              How Atlaris builds your plan
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
            <Button
              asChild
              className={cn('mt-9', marketingPrimaryCtaClassName)}
            >
              <Link href={ROUTES.PLANS.NEW}>{CREATE_PLAN_LABEL}</Link>
            </Button>
          </div>

          <figure
            className={cn(
              'relative flex aspect-[4/5] w-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-2 shadow-xl shadow-black/10 sm:aspect-[4/3] sm:p-3',
              styles.previewFrame,
              styles.revealFromRight,
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
