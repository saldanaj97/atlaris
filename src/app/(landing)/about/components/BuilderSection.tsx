import type { CSSProperties } from 'react';

import { RevealAnimation } from './RevealAnimation';
import { SectionOverline } from '@/components/ui/section-overline';

import styles from './about.module.css';

export function BuilderSection() {
  return (
    <section
      id='about-builder'
      className='mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-24'
      aria-labelledby='about-builder-heading'
    >
      <RevealAnimation>
        <div className='max-w-2xl'>
          {/* oxlint-disable shadcn/require-static-classes -- imported CSS module class is complete but opaque to the rule */}
          <SectionOverline className={styles.revealItem}>
            The builder
          </SectionOverline>
          {/* oxlint-enable shadcn/require-static-classes */}
          <h2
            id='about-builder-heading'
            className={`mt-5 type-display-section text-balance text-foreground ${styles.revealItem}`}
            style={{ '--i': 1 } as CSSProperties}
          >
            Built for the hours you have, mostly after hours.
          </h2>
          <p
            className={`mt-6 max-w-xl type-reading text-muted-foreground ${styles.revealItem}`}
            style={{ '--i': 2 } as CSSProperties}
          >
            Atlaris stays small on purpose. The product centers structured
            learning around the real hours you have, so each part of the route
            points back to useful work.
          </p>
          <p
            className={`mt-4 max-w-xl type-reading text-muted-foreground ${styles.revealItem}`}
            style={{ '--i': 3 } as CSSProperties}
          >
            Atlaris began as a simple idea: name a goal once, get a route that
            holds, sit down and start where you stopped.
          </p>
        </div>
      </RevealAnimation>
    </section>
  );
}
