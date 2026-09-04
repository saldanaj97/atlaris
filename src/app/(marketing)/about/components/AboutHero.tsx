import { SectionOverline } from './SectionOverline';

import styles from './about.module.css';

const copy = {
  overline: 'About Atlaris',
  headlineLead: 'Made after hours.',
  headlineEmphasis: 'For the hours you actually have.',
  subline:
    'Atlaris is a learning atlas built by one person. Here is who, why the night sky, and what the AI does and does not do.',
} as const;

export function AboutHero() {
  return (
    <header
      className='mx-auto flex max-w-3xl flex-col items-center px-6 pt-10 pb-6 text-center sm:pb-8 md:px-8'
      aria-labelledby='about-hero-heading'
    >
      <div className={styles.heroOverline}>
        <SectionOverline>{copy.overline}</SectionOverline>
      </div>
      <h1
        id='about-hero-heading'
        className='mt-5 font-serif text-[2.75rem] leading-[1.08] font-semibold tracking-[-0.03em] text-balance text-foreground sm:text-5xl md:text-[3.25rem]'
      >
        <span className={`block ${styles.heroLead}`}>{copy.headlineLead}</span>
        <span
          className={`mt-1 block font-medium text-primary italic ${styles.heroEmphasis}`}
        >
          {copy.headlineEmphasis}
        </span>
      </h1>
      <p
        className={`mt-6 max-w-3xl font-sans text-base leading-relaxed text-muted-foreground sm:text-lg ${styles.heroCopy}`}
      >
        {copy.subline}
      </p>
    </header>
  );
}
