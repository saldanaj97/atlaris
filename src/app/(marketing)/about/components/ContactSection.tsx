import { RevealAnimation } from './RevealAnimation';
import { SectionOverline } from './SectionOverline';
import { marketingSecondaryCtaClassName } from '@/app/(marketing)/_shared/marketing-cta';

import styles from './about.module.css';

export function ContactSection() {
  return (
    <section
      className='mx-auto max-w-3xl px-6 py-16 text-center md:px-8 md:py-24'
      aria-labelledby='about-contact-heading'
    >
      <RevealAnimation>
        <SectionOverline>A line back</SectionOverline>
        <h2
          id='about-contact-heading'
          className={`mt-5 font-serif text-3xl font-semibold tracking-[-0.025em] text-balance text-foreground sm:text-4xl ${styles.revealItem}`}
          style={{ ['--i' as string]: 1 }}
        >
          If the map is wrong,
          <span className='block font-medium text-muted-foreground italic'>
            say so.
          </span>
        </h2>
        <p
          className={`mx-auto mt-6 max-w-xl font-sans text-base leading-relaxed text-muted-foreground sm:text-lg ${styles.revealItem}`}
          style={{ ['--i' as string]: 2 }}
        >
          A question, a bug, a resource that should not be there, a plan that
          missed the point. Write in. Juan reads every message. Replies come
          from one person, so they may take a night.
        </p>
        <div
          className={`mt-8 ${styles.revealItem}`}
          style={{ ['--i' as string]: 3 }}
        >
          <a
            href='mailto:support@atlaris.app'
            className={marketingSecondaryCtaClassName}
          >
            support@atlaris.app
          </a>
        </div>
      </RevealAnimation>
    </section>
  );
}
