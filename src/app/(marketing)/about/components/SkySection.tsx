import { RevealAnimation } from './RevealAnimation';
import { SectionOverline } from './SectionOverline';

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
      className='mx-auto max-w-3xl px-6 py-16 md:px-8 md:py-24'
      aria-labelledby='about-sky-heading'
    >
      <RevealAnimation>
        <div className='text-center'>
          <SectionOverline>The night sky</SectionOverline>
          <h2
            id='about-sky-heading'
            className={`mt-5 font-serif text-3xl font-semibold tracking-[-0.025em] text-balance text-foreground sm:text-4xl ${styles.revealItem}`}
            style={{ ['--i' as string]: 1 }}
          >
            Why a night sky,
            <span className='block font-medium text-muted-foreground italic'>
              not a scoreboard.
            </span>
          </h2>
          <p
            className={`mx-auto mt-6 max-w-xl font-sans text-base leading-relaxed text-muted-foreground sm:text-lg ${styles.revealItem}`}
            style={{ ['--i' as string]: 2 }}
          >
            Most learning happens after the day is spent. Nine to eleven, a lamp
            on, the house quiet. Atlaris is designed for that hour, so it
            borrows the oldest tool for finding your way in the dark: a chart of
            the sky. The metaphor is not decoration. Every name in the product
            maps to something you can do.
          </p>
        </div>
      </RevealAnimation>

      <RevealAnimation>
        <dl className='mt-10 divide-y divide-border/50 border-y border-border/50'>
          {METAPHORS.map((item, index) => (
            <div
              key={item.term}
              className={`py-5 ${styles.revealItem}`}
              style={{ ['--i' as string]: index }}
            >
              <dt className='font-serif text-base font-semibold text-foreground'>
                {item.term}
              </dt>
              <dd className='mt-3 max-w-prose font-sans text-sm leading-relaxed text-muted-foreground'>
                {item.definition}
              </dd>
            </div>
          ))}
        </dl>
        <p className='mt-8 text-center font-serif text-sm font-medium text-primary'>
          The sky does not hurry. Neither does the plan.
        </p>
      </RevealAnimation>
    </section>
  );
}
