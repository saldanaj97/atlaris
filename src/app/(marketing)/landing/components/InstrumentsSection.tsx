import { RevealAnimation } from './RevealAnimation';
import { SectionOverline } from './SectionOverline';

import styles from './landing.module.css';

const PLAN_MODULES = [
  { title: 'JSX and props', note: 'Done' },
  { title: 'Generics in components', note: 'Tonight' },
  { title: 'Async data layer', note: 'Ahead' },
] as const;

const PULSE_BARS = [
  'h-[28%]',
  'h-[44%]',
  'h-[36%]',
  'h-[62%]',
  'h-[48%]',
  'h-[70%]',
  'h-[58%]',
  'h-[80%]',
] as const;

export function InstrumentsSection() {
  return (
    <section
      className='mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-24'
      aria-labelledby='landing-instruments-heading'
    >
      <RevealAnimation>
        <div className='text-center'>
          <SectionOverline>The instruments</SectionOverline>
          <h2
            id='landing-instruments-heading'
            className={`mt-5 font-serif text-3xl font-semibold tracking-[-0.025em] text-balance text-foreground sm:text-4xl ${styles.revealItem} ${styles.delay1}`}
          >
            Built for the nights you show up.
          </h2>
        </div>
      </RevealAnimation>

      <RevealAnimation>
        <div className='mt-16 grid items-center gap-10 md:grid-cols-2 md:gap-14'>
          <div className={styles.revealFromLeft}>
            <h3 className='font-serif text-2xl font-semibold tracking-[-0.02em] text-foreground'>
              A plan that remembers where you left off
            </h3>
            <p className='mt-4 font-sans text-base leading-relaxed text-muted-foreground'>
              Modules hold the tasks. Tasks hold the resources. Open Atlaris at
              9pm and tonight&apos;s work is already laid out — no re-deciding,
              no re-searching, no twenty open tabs.
            </p>
            <p className='mt-4 font-serif text-sm font-medium text-primary'>
              Sit down. Start where you stopped.
            </p>
          </div>
          <PlanDetailMock />
        </div>
      </RevealAnimation>

      <RevealAnimation>
        <div className='mt-16 grid items-center gap-10 md:grid-cols-2 md:gap-14'>
          <AnalyticsMock />
          <div className={`${styles.revealFromRight} ${styles.delay1}`}>
            <h3 className='font-serif text-2xl font-semibold tracking-[-0.02em] text-foreground'>
              Watch your sky fill in
            </h3>
            <p className='mt-4 font-sans text-base leading-relaxed text-muted-foreground'>
              Every finished task becomes a fixed point. Analytics turn
              scattered evenings into a visible trail — what you covered, when
              you covered it, and how far the route still runs.
            </p>
            <p className='mt-4 font-serif text-sm font-medium text-primary'>
              Momentum you can look at.
            </p>
          </div>
        </div>
      </RevealAnimation>
    </section>
  );
}

function PlanDetailMock() {
  return (
    <figure
      className={`overflow-hidden rounded-4xl border border-border/50 bg-card p-6 shadow-sm md:p-7 ${styles.revealFromRight} ${styles.delay1}`}
    >
      <div aria-hidden='true'>
        <p className='text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase'>
          Current focus
        </p>
        <p className='mt-4 text-xl font-semibold text-foreground'>
          TypeScript for React apps
        </p>
        <p className='mt-1 text-sm text-muted-foreground'>
          Next module · Generics in components
        </p>
        <ol className='mt-6 divide-y divide-border/50 border-y border-border/50'>
          {PLAN_MODULES.map((module) => (
            <li
              key={module.title}
              className={`flex items-center justify-between gap-3 py-3 text-sm ${styles.planRow}`}
            >
              <span className='text-foreground'>{module.title}</span>
              <span className='text-xs text-muted-foreground tabular-nums'>
                {module.note}
              </span>
            </li>
          ))}
        </ol>
        <div className='mt-6 h-1.5 overflow-hidden rounded-full bg-muted'>
          <div
            className={`h-full w-[42%] rounded-full bg-primary ${styles.progressFill}`}
          />
        </div>
      </div>
      <figcaption className='sr-only'>
        Plan detail with modules, tonight&apos;s task, and a progress track.
      </figcaption>
    </figure>
  );
}

function AnalyticsMock() {
  return (
    <figure
      className={`overflow-hidden rounded-4xl border border-border/50 bg-card p-6 shadow-sm md:p-7 ${styles.revealFromLeft}`}
    >
      <div aria-hidden='true'>
        <p className='text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase'>
          Eight-week pulse
        </p>
        <p className='mt-4 text-3xl font-semibold text-foreground tabular-nums'>
          6.5 hrs
        </p>
        <p className='mt-1 text-sm text-muted-foreground'>
          Completed this week
        </p>
        <div className='mt-6 flex h-24 items-end gap-2'>
          {PULSE_BARS.map((height) => (
            <div
              key={height}
              className={`flex-1 rounded-sm bg-primary/80 ${height} ${styles.analyticsBar}`}
            />
          ))}
        </div>
      </div>
      <figcaption className='sr-only'>
        Analytics with weekly completed time and an eight-week activity chart.
      </figcaption>
    </figure>
  );
}
