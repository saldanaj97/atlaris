import { RevealAnimation } from './RevealAnimation';
import { SectionOverline } from './SectionOverline';

import styles from './about.module.css';

export function BuilderSection() {
  return (
    <section
      className='mx-auto max-w-3xl px-6 py-16 text-center md:px-8 md:py-24'
      aria-labelledby='about-builder-heading'
    >
      <RevealAnimation>
        <SectionOverline>The builder</SectionOverline>
        <h2
          id='about-builder-heading'
          className={`mt-5 font-serif text-3xl font-semibold tracking-[-0.025em] text-balance text-foreground sm:text-4xl ${styles.revealItem}`}
          style={{ ['--i' as string]: 1 }}
        >
          Built by one person.
          <span className='block font-medium text-muted-foreground italic'>
            Mostly after hours.
          </span>
        </h2>
        <p
          className={`mx-auto mt-6 max-w-xl font-sans text-base leading-relaxed text-muted-foreground sm:text-lg ${styles.revealItem}`}
          style={{ ['--i' as string]: 2 }}
        >
          Juan Saldana designs, builds, and runs Atlaris. There is no team
          behind it. That means the product stays small on purpose, and it means
          fixes arrive when one person can make them. It also means that when
          you write in, the person who wrote the code reads it.
        </p>
        <p
          className={`mx-auto mt-4 max-w-xl font-sans text-base leading-relaxed text-muted-foreground sm:text-lg ${styles.revealItem}`}
          style={{ ['--i' as string]: 3 }}
        >
          Atlaris began as the tool Juan wanted for his own evenings: name a
          goal once, get a route that holds, sit down and start where he
          stopped.
        </p>
      </RevealAnimation>
    </section>
  );
}
