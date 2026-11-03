import { RevealAnimation } from './RevealAnimation';

import styles from './landing.module.css';

/** Why Atlaris exists, from the visitor's side: plans that ignore your hours stall. */
export function ProblemSection() {
  return (
    <section
      className='mx-auto box-content max-w-7xl px-6 py-16 md:px-8 md:py-24'
      aria-labelledby='landing-problem-heading'
    >
      <RevealAnimation>
        {/* oxlint-disable-next-line shadcn/require-static-classes -- imported CSS module class is complete but opaque to the rule */}
        <div
          className={`grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-14 ${styles.revealItem}`}
        >
          <h2
            id='landing-problem-heading'
            className='max-w-[18ch] type-display-section text-balance text-foreground'
          >
            Most plans are written for hours you don&apos;t have
          </h2>
          <div className='max-w-[60ch] space-y-4 type-reading text-muted-foreground'>
            <p>
              A course assumes free evenings. A syllabus assumes a semester. You
              start strong, lose a week to work, and the plan is suddenly behind
              you with no way back in.
            </p>
            <p>
              That isn&apos;t a discipline problem. The plan never knew how much
              time you had. Atlaris asks first, then sizes every module and task
              to the hours you named.
            </p>
          </div>
        </div>
      </RevealAnimation>
    </section>
  );
}
