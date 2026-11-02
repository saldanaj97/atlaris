import type { CSSProperties } from 'react';

import { RevealAnimation } from './RevealAnimation';
import { SectionOverline } from '@/components/ui/section-overline';

import styles from './about.module.css';

const METAPHORS = [
  {
    term: 'Star',
    definition: 'The goal you name at setup.',
  },
  {
    term: 'Route',
    definition:
      'The week-by-week plan Atlaris drafts from it. Modules, tasks, and the resources attached to each.',
  },
  {
    term: 'Drift',
    definition:
      'The failure mode. Not a lack of ambition. The busy Thursday when the map goes dark.',
  },
  {
    term: 'Bearings',
    definition:
      'Progress. Every finished task becomes a fixed point you can look back at.',
  },
  {
    term: 'Polaris',
    definition:
      'The one thing that does not move. The plan waits. Nothing expires.',
  },
  {
    term: 'Quiet hours',
    definition: 'Your real study time. The whole product is built for it.',
  },
] as const;

export function SkySection() {
  return (
    <section
      className='mx-auto max-w-6xl px-6 py-12 md:px-8 md:py-16'
      aria-labelledby='about-sky-heading'
    >
      <RevealAnimation>
        <div className='grid items-center gap-10 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-14'>
          <div>
            {/* oxlint-disable shadcn/require-static-classes -- imported CSS module class is complete but opaque to the rule */}
            <SectionOverline className={styles.revealItem}>
              The night sky
            </SectionOverline>
            {/* oxlint-enable shadcn/require-static-classes */}
            <h2
              id='about-sky-heading'
              className={`mt-5 type-display-section text-balance text-foreground ${styles.revealItem}`}
              style={{ '--i': 1 } as CSSProperties}
            >
              Why a night sky, not a scoreboard.
            </h2>
            <p
              className={`mt-6 max-w-xl type-reading text-muted-foreground ${styles.revealItem}`}
              style={{ '--i': 2 } as CSSProperties}
            >
              Most learning happens after the day is spent. Nine to eleven, a
              lamp on, the house quiet. Atlaris is designed for that hour, so it
              borrows the oldest tool for finding your way in the dark: a chart
              of the sky. The metaphor is not decoration. Every name in the
              product maps to something you can do.
            </p>
          </div>
          <figure
            className={`overflow-hidden rounded-lg border border-border bg-panel p-4 shadow-sm sm:p-6 ${styles.revealFromRight}`}
            style={{ '--i': 1 } as CSSProperties}
          >
            <RouteConstellation />
            <figcaption className='sr-only'>
              A plan route drawn as a constellation: finished weeks behind you,
              tonight&apos;s task, and the goal at the end.
            </figcaption>
          </figure>
        </div>
      </RevealAnimation>

      <RevealAnimation>
        <dl className='mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {METAPHORS.map((item, index) => (
            <div
              key={item.term}
              className={`rounded-lg border border-border bg-panel p-5 ${styles.revealItem}`}
              style={{ '--i': index } as CSSProperties}
            >
              <dt className='type-reading font-serif font-semibold text-foreground'>
                {item.term}
              </dt>
              <dd className='mt-3 max-w-prose type-body text-muted-foreground'>
                {item.definition}
              </dd>
            </div>
          ))}
        </dl>
        <p className='mt-8 text-center type-label font-serif text-primary'>
          The sky does not hurry. Neither does the plan.
        </p>
      </RevealAnimation>
    </section>
  );
}

/** Route points from finished weeks up to the goal, in viewBox units. */
const ROUTE_POINTS = [
  { x: 36, y: 176, state: 'done', label: 'Week 1' },
  { x: 104, y: 140, state: 'done', label: null },
  { x: 170, y: 152, state: 'current', label: 'Tonight' },
  { x: 236, y: 104, state: 'ahead', label: null },
  { x: 290, y: 76, state: 'ahead', label: null },
] as const;
const GOAL = { x: 334, y: 40 };

/** The route as a constellation: Bearings behind, tonight's point, the Star ahead. */
function RouteConstellation() {
  const path = [...ROUTE_POINTS, GOAL]
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
    .join(' ');

  return (
    <svg
      viewBox='0 0 360 210'
      aria-hidden='true'
      className='block h-auto w-full'
    >
      <path
        d={path}
        fill='none'
        className='stroke-link/60'
        strokeWidth='1.25'
        strokeDasharray='3 5'
      />
      {ROUTE_POINTS.map((point) => (
        <g key={`${point.x}-${point.y}`}>
          {point.state === 'current' ? (
            <circle
              cx={point.x}
              cy={point.y}
              r='9'
              className='fill-none stroke-action-primary/50'
              strokeWidth='1.25'
            />
          ) : null}
          <circle
            cx={point.x}
            cy={point.y}
            r={point.state === 'ahead' ? 3 : 4.5}
            className={
              point.state === 'ahead'
                ? 'fill-panel stroke-link'
                : 'fill-action-primary'
            }
            strokeWidth='1.25'
          />
          {point.label ? (
            <text
              x={point.x}
              y={point.y + 24}
              textAnchor='middle'
              fontSize={11}
              className='fill-muted-foreground'
            >
              {point.label}
            </text>
          ) : null}
        </g>
      ))}
      <path
        d={`M${GOAL.x} ${GOAL.y - 11} L${GOAL.x + 3} ${GOAL.y - 3} L${GOAL.x + 11} ${GOAL.y} L${GOAL.x + 3} ${GOAL.y + 3} L${GOAL.x} ${GOAL.y + 11} L${GOAL.x - 3} ${GOAL.y + 3} L${GOAL.x - 11} ${GOAL.y} L${GOAL.x - 3} ${GOAL.y - 3} Z`}
        className='fill-foreground'
      />
      <text
        x={GOAL.x - 18}
        y={GOAL.y + 4}
        textAnchor='end'
        fontSize={11}
        className='fill-foreground font-semibold'
      >
        Your goal
      </text>
      <text
        x='36'
        y='28'
        fontSize={10}
        letterSpacing='0.18em'
        className='fill-muted-foreground uppercase'
      >
        Route · 6 weeks
      </text>
    </svg>
  );
}
