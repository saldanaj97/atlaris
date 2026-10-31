import type { CSSProperties } from 'react';

import { HeroStars } from './HeroStars';
import { ibmPlexMono, instrumentSerif } from '@/app/fonts';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/features/navigation/routes';
import { cn } from '@/lib/utils';
import { TIER_LIMITS } from '@/shared/constants/tier-limits';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import styles from './landing.module.css';

const FREE_WEEKS = TIER_LIMITS.free.maxWeeks;
const FREE_ACTIVE_PLANS = TIER_LIMITS.free.maxActivePlans;

const copy = {
  subheadline:
    'Set your level and weekly hours. Atlaris writes the plan in modules and tasks, each with a time estimate.',
  primaryCta: 'Create a plan',
  secondaryCta: 'See pricing',
  freePlan: `Free plan: ${FREE_ACTIVE_PLANS === 1 ? 'one active plan' : `${FREE_ACTIVE_PLANS} active plans`}, up to ${FREE_WEEKS === 2 ? 'two weeks' : `${FREE_WEEKS} weeks`}`,
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
  thisWeek: [
    { name: 'Read: generic constraints', minutes: 40, done: true },
    { name: 'Exercise: type a fetch helper', minutes: 50, done: true },
    { name: 'Build: a typed useQuery hook', minutes: 90, done: false },
    { name: 'Review: Module 3 notes', minutes: 60, done: false },
  ],
  weeklyHours: [3, 4, 4.5, 2, 4, 5, 3.5, 4],
} as const;

type ModuleState = (typeof EXAMPLE_PLAN.modules)[number]['state'];

const doneMinutes = EXAMPLE_PLAN.thisWeek
  .filter((task) => task.done)
  .reduce((sum, task) => sum + task.minutes, 0);
const plannedMinutes = EXAMPLE_PLAN.thisWeek.reduce(
  (sum, task) => sum + task.minutes,
  0,
);

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} hr${hours === 1 ? '' : 's'}`;
  return `${hours} hr ${rest}`;
}

function formatHours(hours: number): string {
  return `${hours} hr${hours === 1 ? '' : 's'}`;
}

export function HeroSection() {
  return (
    <section
      data-atlaris-theme='dark'
      className={cn(
        'dark relative isolate overflow-hidden bg-background text-foreground',
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

      <div className='relative z-10 mx-auto max-w-7xl px-4 pt-14 sm:px-6 sm:pt-16 md:px-8 md:pt-20'>
        <div className={cn('text-center', styles.heroRise)}>
          <h1
            id='landing-hero-heading'
            className={cn('mx-auto max-w-[15ch] text-balance', styles.headline)}
          >
            Name a goal. Get a plan for the <em>hours</em> you have.
          </h1>
          <p
            className={cn(
              'mx-auto mt-6 max-w-[52ch]',
              styles.mono,
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
              className={cn('rounded-full bg-transparent', styles.ctaMotion)}
            >
              <Link href={ROUTES.PRICING}>{copy.secondaryCta}</Link>
            </Button>
          </div>
          <p className={cn('mt-4', styles.mono, styles.fine)}>
            {copy.freePlan}
          </p>
        </div>

        <HeroPlanCards />
      </div>
      {/* oxlint-enable shadcn/require-static-classes */}
    </section>
  );
}

const moduleDotClass: Record<ModuleState, string> = {
  done: 'border-chart-1 bg-chart-1',
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
    // Light scope: the cards and their labels show the product as it looks in the light theme.
    // oxlint-disable-next-line shadcn/require-static-classes -- CSS module classes are complete but opaque to the rule
    <figure
      data-atlaris-theme='light'
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
        Example plan · {EXAMPLE_PLAN.title} · {EXAMPLE_PLAN.weeks} weeks ·{' '}
        {formatHours(EXAMPLE_PLAN.hoursPerWeek)} a week
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
                        {formatHours(module.hours)}
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
          <CardLabel>This week</CardLabel>
          <div className={styles.card}>
            <div className={cn('flex', styles.panel)}>
              <div className='flex items-center justify-between gap-2'>
                <p className='type-meta text-muted-foreground tabular-nums'>
                  {formatMinutes(plannedMinutes)} planned ·{' '}
                  {formatMinutes(doneMinutes)} done
                </p>
                <span className='rounded-full border border-border px-2 py-0.5 type-meta text-muted-foreground'>
                  Week {EXAMPLE_PLAN.weeks} of {EXAMPLE_PLAN.weeks}
                </span>
              </div>
              <ul className='m-0 flex list-none flex-col p-0'>
                {EXAMPLE_PLAN.thisWeek.map((task) => (
                  <li
                    key={task.name}
                    className='grid min-h-[2.25rem] grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-border type-body first:border-t-0'
                  >
                    <span
                      aria-hidden='true'
                      className={cn(
                        'size-3.5 rounded-[4px] border',
                        task.done
                          ? 'border-chart-1 bg-chart-1'
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
                className='mt-auto h-1.5 overflow-hidden rounded-full border border-input bg-card'
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
          <CardLabel>Eight-week pulse</CardLabel>
          <div className={styles.card}>
            <div className={cn('flex', styles.panel)}>
              <p className='type-meta text-muted-foreground'>
                Hours logged per week ·{' '}
                {EXAMPLE_PLAN.weeklyHours.reduce(
                  (sum, hours) => sum + hours,
                  0,
                )}{' '}
                hrs total
              </p>
              <PulseChart />
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}

const CHART = {
  width: 240,
  height: 112,
  left: 24,
  right: 232,
  top: 10,
  bottom: 90,
  maxHours: 6,
};

function PulseChart() {
  const values = EXAMPLE_PLAN.weeklyHours;
  const step = (CHART.right - CHART.left) / (values.length - 1);
  const x = (index: number) => CHART.left + index * step;
  const y = (hours: number) =>
    CHART.bottom - (hours / CHART.maxHours) * (CHART.bottom - CHART.top);
  const line = values
    .map(
      (hours, index) =>
        `${index === 0 ? 'M' : 'L'}${x(index).toFixed(2)},${y(hours).toFixed(2)}`,
    )
    .join(' ');
  const area = `${line} L${CHART.right},${CHART.bottom} L${CHART.left},${CHART.bottom} Z`;
  const last = values.length - 1;

  return (
    <>
      <p className='sr-only'>
        Hours logged per week over eight weeks: {values.join(', ')}
      </p>
      <svg
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        className='mt-auto block h-auto w-full'
        aria-hidden='true'
      >
        {[6, 4, 2, 0].map((hours) => (
          <g key={hours}>
            <line
              x1={CHART.left}
              x2={CHART.right}
              y1={y(hours)}
              y2={y(hours)}
              className='stroke-border'
              strokeWidth='1'
            />
            <text
              x='2'
              y={y(hours) + 3}
              className='fill-muted-foreground'
              fontSize='8'
            >
              {hours === 0 ? '0' : `${hours}h`}
            </text>
          </g>
        ))}
        <path d={area} className='fill-chart-1' fillOpacity='0.18' />
        <path
          d={line}
          className='stroke-chart-1'
          fill='none'
          strokeWidth='1.75'
          strokeLinejoin='round'
          strokeLinecap='round'
        />
        <circle
          cx={x(last)}
          cy={y(values[last])}
          r='3.5'
          className='fill-action-primary stroke-card'
          strokeWidth='2'
        />
        {values.map((_, index) => (
          <text
            key={index}
            x={x(index)}
            y='106'
            textAnchor='middle'
            className='fill-muted-foreground'
            fontSize='8'
          >
            W{index + 1}
          </text>
        ))}
      </svg>
    </>
  );
}
