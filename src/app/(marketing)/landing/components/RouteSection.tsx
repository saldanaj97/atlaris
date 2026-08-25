import { RevealAnimation } from './RevealAnimation';
import { SectionOverline } from './SectionOverline';

import styles from './landing.module.css';

const ROUTE_STOPS = [
  {
    numeral: 'I',
    title: 'Set your star',
    copy: 'Name the goal, your level, and the hours you actually have. That is the whole setup — about two minutes.',
  },
  {
    numeral: 'II',
    title: 'Follow the route',
    copy: 'Atlaris charts a week-by-week plan: modules, tasks, and every resource attached to the work it supports.',
  },
  {
    numeral: 'III',
    title: 'Check your bearings',
    copy: 'Progress tracking shows what moved this week, so you return to a course — not a memory of one.',
  },
] as const;

export function RouteSection() {
  return (
    <section
      className='mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-24'
      aria-labelledby='landing-route-heading'
    >
      <RevealAnimation>
        <div className='text-center'>
          <SectionOverline>The route</SectionOverline>
          <h2
            id='landing-route-heading'
            className={`mt-5 font-serif text-3xl font-semibold tracking-[-0.025em] text-balance text-foreground sm:text-4xl ${styles.revealItem}`}
            style={{ ['--i' as string]: 1 }}
          >
            Three moves. One steady course.
          </h2>
        </div>
      </RevealAnimation>

      <RevealAnimation>
        <div className='relative mt-14'>
          <ConstellationRoute />
          <div className='relative grid gap-10 md:grid-cols-3 md:gap-6 md:pt-28'>
            {ROUTE_STOPS.map((stop, index) => (
              <article
                key={stop.title}
                className={`text-center md:text-left ${styles.revealItem}`}
                style={{ ['--i' as string]: index }}
              >
                <p className='font-serif text-sm font-semibold tracking-[0.2em] text-primary'>
                  {stop.numeral}
                </p>
                <h3 className='mt-3 font-serif text-xl font-semibold tracking-[-0.015em] text-foreground'>
                  {stop.title}
                </h3>
                <p className='mx-auto mt-3 max-w-[18rem] font-sans text-sm leading-relaxed text-muted-foreground md:mx-0'>
                  {stop.copy}
                </p>
                {index === 0 ? (
                  <p className='mt-3 font-sans text-xs tracking-[0.08em] text-primary/80 uppercase'>
                    ~2 minutes
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </RevealAnimation>
    </section>
  );
}

function ConstellationRoute() {
  return (
    <svg
      viewBox='0 0 1000 120'
      fill='none'
      preserveAspectRatio='none'
      className='pointer-events-none absolute inset-x-0 top-10 hidden h-24 w-full md:block'
      aria-hidden='true'
    >
      <path
        className={styles.routePath}
        d='M 60 90 C 250 20, 420 100, 500 60 C 580 20, 760 100, 940 40'
        stroke='var(--primary)'
        strokeOpacity='0.45'
        strokeWidth='1.5'
        strokeDasharray='1'
        pathLength={1}
      />
      <circle
        className={styles.routeDot}
        cx='60'
        cy='90'
        r='5'
        fill='var(--primary)'
        style={{ ['--i' as string]: 0 }}
      />
      <circle
        className={styles.routeDot}
        cx='500'
        cy='60'
        r='5'
        fill='var(--primary)'
        style={{ ['--i' as string]: 1 }}
      />
      <circle
        className={styles.routeDot}
        cx='940'
        cy='40'
        r='5'
        fill='var(--primary)'
        style={{ ['--i' as string]: 2 }}
      />
    </svg>
  );
}
