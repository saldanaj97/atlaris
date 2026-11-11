import type { CSSProperties } from 'react';

import { HeroStars } from './HeroStars';
import { ibmPlexMono, instrumentSerif } from '@/app/fonts';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/features/navigation/routes';
import { formatMinutes } from '@/features/plans/formatters';
import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import styles from './landing.module.css';

const copy = {
  subheadline:
    'Set your level and weekly hours. Atlaris writes the plan in modules and tasks, each with a time estimate.',
  primaryCta: 'Create a plan',
  secondaryCta: 'See pricing',
  plans: 'Starter and Pro plans. Cancel any time.',
} as const;

/** Example plan shown in the hero. Illustrative data, labelled as such. */
const EXAMPLE_PLAN = {
  title: 'TypeScript for React',
  weeks: 2,
  hoursPerWeek: 4,
  modules: [
    { name: 'Types that scale', hours: 2, state: 'done' },
    { name: 'Props and state', hours: 2, state: 'done' },
    { name: 'Generics in practice', hours: 2, state: 'next' },
    { name: 'Typed hooks', hours: 2, state: 'todo' },
  ],
  // Generics in practice, the module in progress (as in RoadmapPreview).
  currentTasks: [
    { name: 'Read: generic constraints', minutes: 40, done: true },
    { name: 'Exercise: type a fetch helper', minutes: 50, done: true },
    { name: 'Review: Module 3 notes', minutes: 30, done: false },
  ],
} as const;

type ModuleState = (typeof EXAMPLE_PLAN.modules)[number]['state'];

const currentModuleIndex = EXAMPLE_PLAN.modules.findIndex(
  (module) => module.state === 'next',
);
const doneMinutes = EXAMPLE_PLAN.currentTasks
  .filter((task) => task.done)
  .reduce((sum, task) => sum + task.minutes, 0);
const plannedMinutes = EXAMPLE_PLAN.modules[currentModuleIndex].hours * 60;
// Finished modules count in full, the current one by its finished tasks.
const moduleProgress = EXAMPLE_PLAN.modules.map((module, index) => ({
  label: `Module ${index + 1}`,
  done:
    module.state === 'done'
      ? module.hours * 60
      : module.state === 'next'
        ? doneMinutes
        : 0,
  planned: module.hours * 60,
}));

export function HeroSection() {
  return (
    <section
      className={cn(
        'relative isolate overflow-hidden bg-background text-foreground',
        styles.hero,
        instrumentSerif.variable,
        ibmPlexMono.variable,
      )}
      aria-labelledby='landing-hero-heading'
    >
      {/* oxlint-disable shadcn/require-static-classes -- CSS module classes are complete but opaque to the rule */}
      <HeroStars />
      <div className={cn(styles.layer, styles.bloom)} aria-hidden='true' />
      <div className={cn(styles.layer, styles.beam)} aria-hidden='true' />
      <div className={cn(styles.layer, styles.warm)} aria-hidden='true' />
      <div className={cn(styles.layer, styles.core)} aria-hidden='true' />
      <div className={cn(styles.layer, styles.flutes)} aria-hidden='true' />

      <div className='relative z-10 mx-auto max-w-7xl px-6 pt-14 sm:pt-16 md:px-8 md:pt-20'>
        <div className={cn('text-center', styles.heroRise)}>
          <h1
            id='landing-hero-heading'
            className={cn('mx-auto max-w-[15ch] text-balance', styles.headline)}
          >
            {/* "Get" stays with "a plan" rather than ending the first line. */}
            Name a goal. Get{'\u00a0'}a plan for the <em>hours</em> you have.
          </h1>
          <p
            className={cn(
              'mx-auto mt-6 max-w-[52ch]',
              styles.sub,
              styles.onBeam,
            )}
          >
            {copy.subheadline}
          </p>
          <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
            <Button
              asChild
              variant='cta'
              size='lg'
              className={cn('rounded-full', styles.ctaMotion)}
            >
              <Link href={ROUTES.PLANS.NEW}>
                {copy.primaryCta}
                <ArrowRight
                  className='size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none'
                  aria-hidden='true'
                />
              </Link>
            </Button>
            <Button
              asChild
              variant='outline'
              size='lg'
              className={cn(
                'rounded-full bg-transparent',
                styles.outlineCta,
                styles.ctaMotion,
              )}
            >
              <Link href={ROUTES.PRICING}>{copy.secondaryCta}</Link>
            </Button>
          </div>
          <p
            className={cn(
              'mx-auto mt-4 w-fit',
              styles.mono,
              styles.fine,
              styles.chip,
            )}
          >
            {copy.plans}
          </p>
        </div>

        <HeroPlanCards />
      </div>
      {/* oxlint-enable shadcn/require-static-classes */}
    </section>
  );
}

const moduleDotClass: Record<ModuleState, string> = {
  done: 'border-success bg-success',
  next: 'border-action-primary bg-action-primary',
  todo: 'border-muted-foreground bg-card',
};

/** Mono label above a card, on a frosted chip so it reads on any part of the light. */
function CardLabel({ children }: { children: string }) {
  return (
    // oxlint-disable-next-line shadcn/require-static-classes -- CSS module classes are complete but opaque to the rule
    <p
      className={cn(
        'mb-3 flex w-fit items-center gap-2 font-medium',
        styles.mono,
        styles.fine,
        styles.chip,
      )}
    >
      <span
        aria-hidden='true'
        className='size-1.5 rounded-full bg-action-primary'
      />
      {children}
    </p>
  );
}

function HeroPlanCards() {
  return (
    // oxlint-disable-next-line shadcn/require-static-classes -- CSS module classes are complete but opaque to the rule
    <figure
      className={cn(
        'relative mt-12 mb-0 text-foreground md:mt-14',
        styles.cardStage,
      )}
    >
      {/* oxlint-disable-next-line shadcn/require-static-classes -- CSS module classes are complete but opaque to the rule */}
      <figcaption
        className={cn(
          'mx-auto mb-5 w-fit text-center',
          styles.mono,
          styles.fine,
          styles.chip,
        )}
      >
        {/* Non-breaking spaces before each "·" keep it off the end of a line,
            and keep each number with its unit. */}
        Example plan{'\u00a0'}· {EXAMPLE_PLAN.title}
        {'\u00a0'}· {EXAMPLE_PLAN.weeks}
        {'\u00a0'}weeks{'\u00a0'}·{' '}
        <span className='whitespace-nowrap'>
          {formatMinutes(EXAMPLE_PLAN.hoursPerWeek * 60)} a week
        </span>
      </figcaption>
      {/* oxlint-disable-next-line shadcn/require-static-classes -- CSS module classes are complete but opaque to the rule */}
      <div
        className={cn(
          'mx-auto grid max-w-xl items-end gap-4 lg:max-w-5xl lg:grid-cols-[1fr_1.12fr_1fr] lg:gap-5',
          styles.cards,
        )}
      >
        <div className={cn('hidden lg:block', styles.cell)}>
          <CardLabel>Plan route</CardLabel>
          <div className={styles.card}>
            <div className={cn('flex', styles.panel)}>
              <ol className='m-0 flex list-none flex-col p-0'>
                {EXAMPLE_PLAN.modules.map((module, index) => (
                  <li
                    key={module.name}
                    className='relative grid min-h-[2.25rem] grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-3 type-body'
                  >
                    <span
                      aria-hidden='true'
                      className={cn(
                        'absolute left-[calc(0.5rem-0.5px)] w-px bg-border',
                        index === 0
                          ? 'top-1/2 bottom-0'
                          : index === EXAMPLE_PLAN.modules.length - 1
                            ? 'top-0 bottom-1/2'
                            : 'inset-y-0',
                      )}
                    />
                    <span
                      aria-hidden='true'
                      className={cn(
                        'relative z-10 size-2.5 justify-self-center rounded-full border-2',
                        moduleDotClass[module.state],
                      )}
                    />
                    <span
                      className={cn(
                        'truncate',
                        module.state === 'next' && 'font-semibold',
                        module.state === 'todo' && 'text-muted-foreground',
                      )}
                    >
                      {module.name}
                    </span>
                    {module.state === 'next' ? (
                      <span className='rounded-full bg-action-primary px-2 py-0.5 type-meta font-medium text-action-primary-foreground'>
                        Next
                      </span>
                    ) : (
                      <span className='type-meta text-muted-foreground tabular-nums'>
                        {formatMinutes(module.hours * 60)}
                        {module.state === 'done' ? ' · done' : ''}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        <div className={cn(styles.cell, styles.cellCenter)}>
          <CardLabel>Current module</CardLabel>
          <div className={styles.card}>
            <div className={cn('flex', styles.panel)}>
              <div className='flex items-center justify-between gap-2'>
                <p className='type-meta text-muted-foreground tabular-nums'>
                  {formatMinutes(plannedMinutes)} planned ·{' '}
                  {formatMinutes(doneMinutes)} done
                </p>
                <span className='rounded-full border border-border px-2 py-0.5 type-meta text-muted-foreground'>
                  Module {currentModuleIndex + 1} of{' '}
                  {EXAMPLE_PLAN.modules.length}
                </span>
              </div>
              <ul className='m-0 flex list-none flex-col p-0'>
                {EXAMPLE_PLAN.currentTasks.map((task) => (
                  <li
                    key={task.name}
                    className='grid min-h-[2.25rem] grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-border type-body first:border-t-0'
                  >
                    <span
                      aria-hidden='true'
                      className={cn(
                        'size-3.5 rounded-[4px] border',
                        task.done
                          ? 'border-success bg-success'
                          : 'border-muted-foreground',
                      )}
                    />
                    <span
                      className={cn(
                        'truncate',
                        task.done && 'text-muted-foreground line-through',
                      )}
                    >
                      {task.done ? (
                        <span className='sr-only'>Done: </span>
                      ) : null}
                      {task.name}
                    </span>
                    <span className='type-meta text-muted-foreground tabular-nums'>
                      {formatMinutes(task.minutes)}
                    </span>
                  </li>
                ))}
              </ul>
              <div
                className='mt-auto h-1.5 overflow-hidden rounded-full bg-muted'
                aria-hidden='true'
              >
                <span
                  className='block h-full w-(--hero-progress) rounded-full bg-action-primary'
                  style={
                    {
                      '--hero-progress': `${Math.round((doneMinutes / plannedMinutes) * 100)}%`,
                    } as CSSProperties
                  }
                />
              </div>
            </div>
          </div>
        </div>

        <div className={cn('hidden lg:block', styles.cell)}>
          <CardLabel>Plan progress</CardLabel>
          <div className={styles.card}>
            <div className={cn('flex', styles.panel)}>
              <p className='type-meta text-muted-foreground'>
                Estimated time done
              </p>
              <p className='type-title tabular-nums'>
                {formatMinutes(
                  moduleProgress.reduce((sum, entry) => sum + entry.done, 0),
                )}{' '}
                <span className='type-meta text-muted-foreground'>
                  of{' '}
                  {formatMinutes(
                    moduleProgress.reduce(
                      (sum, entry) => sum + entry.planned,
                      0,
                    ),
                  )}
                </span>
              </p>
              <ul className='m-0 mt-3 flex list-none flex-col gap-3 p-0'>
                {moduleProgress.map(({ label, done, planned }) => (
                  <li key={label} className='flex flex-col gap-2'>
                    <div className='flex items-baseline justify-between gap-2'>
                      <span className='type-body'>{label}</span>
                      <span className='type-meta text-muted-foreground tabular-nums'>
                        {formatMinutes(done)} of {formatMinutes(planned)}
                      </span>
                    </div>
                    <div
                      className='h-1.5 overflow-hidden rounded-full bg-muted'
                      aria-hidden='true'
                    >
                      <span
                        className='block h-full w-(--hero-progress) rounded-full bg-action-primary'
                        style={
                          {
                            '--hero-progress': `${Math.round((done / planned) * 100)}%`,
                          } as CSSProperties
                        }
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}
