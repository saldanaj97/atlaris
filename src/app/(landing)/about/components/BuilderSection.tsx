import type { CSSProperties } from 'react';

import { RevealAnimation } from './RevealAnimation';
import { SectionOverline } from '@/components/ui/section-overline';
import Image from 'next/image';

import styles from './about.module.css';

export function BuilderSection() {
  return (
    <section
      id='about-builder'
      className='mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-24'
      aria-labelledby='about-builder-heading'
    >
      <RevealAnimation>
        <div className='grid items-center gap-10 md:grid-cols-2 md:gap-14'>
          <figure
            className={`overflow-hidden rounded-lg border border-panel-border bg-panel shadow-sm ${styles.revealFromLeft}`}
            style={{ '--i': 0 } as CSSProperties}
          >
            <Image
              src='/artwork/builder-workspace.webp'
              alt='Illustration of a laptop and desk at night'
              width={800}
              height={450}
              sizes='(min-width: 768px) 50vw, 100vw'
              className='block aspect-video h-auto w-full object-cover'
            />
          </figure>
          <div>
            {/* oxlint-disable shadcn/require-static-classes -- imported CSS module class is complete but opaque to the rule */}
            <SectionOverline className={styles.revealItem}>
              The builder
            </SectionOverline>
            {/* oxlint-enable shadcn/require-static-classes */}
            <h2
              id='about-builder-heading'
              className={`mt-5 font-serif text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl ${styles.revealItem}`}
              style={{ '--i': 1 } as CSSProperties}
            >
              Built for the hours you have.
              <span className='block font-medium text-muted-foreground italic'>
                Mostly after hours.
              </span>
            </h2>
            <p
              className={`mt-6 max-w-xl font-sans text-base leading-relaxed text-muted-foreground sm:text-lg ${styles.revealItem}`}
              style={{ '--i': 2 } as CSSProperties}
            >
              Atlaris stays small on purpose. The product centers structured
              learning around the real hours you have, so each part of the route
              points back to useful work.
            </p>
            <p
              className={`mt-4 max-w-xl font-sans text-base leading-relaxed text-muted-foreground sm:text-lg ${styles.revealItem}`}
              style={{ '--i': 3 } as CSSProperties}
            >
              Atlaris began as a simple idea: name a goal once, get a route that
              holds, sit down and start where you stopped.
            </p>
          </div>
        </div>
      </RevealAnimation>
    </section>
  );
}
