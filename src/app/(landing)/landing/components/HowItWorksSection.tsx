import type { CSSProperties } from 'react';

import { RevealAnimation } from './RevealAnimation';
import { EXAMPLE_ROADMAP_SUMMARY } from './RoadmapPreview';
import { cn } from '@/lib/utils';

import styles from './landing.module.css';

/**
 * The three steps, each with a line from the hero's example plan (TypeScript
 * for React, two weeks, 4 hrs a week). Values match the create-plan form
 * options and the example cards, so the page tells one consistent story.
 */
const STEPS = [
  {
    title: 'Name the goal',
    copy: 'Tell Atlaris the topic, your level, the hours you have each week, how you like to learn and when you’d like to finish.',
    example:
      'TypeScript for React · Intermediate · 3–5 hours a week · Hands-on · 2 weeks',
  },
  {
    title: 'Atlaris drafts the route',
    copy: 'An AI model writes the plan as modules and tasks sized to your hours, each task with a time estimate.',
    example: EXAMPLE_ROADMAP_SUMMARY,
  },
  {
    title: 'Work it module by module',
    copy: 'Mark tasks done as you go. Lessons for the next modules are written as you reach them. Paid plans can regenerate a draft that missed the mark: too basic, too advanced, wrong focus.',
    example: 'Module 3 of 4 · 1.5 hrs of 2 hrs done',
  },
] as const;

export function HowItWorksSection() {
  return (
    <section
      className='mx-auto box-content max-w-7xl px-6 pb-16 md:px-8 md:pb-24'
      aria-labelledby='landing-how-heading'
    >
      <RevealAnimation>
        {/* oxlint-disable shadcn/require-static-classes -- imported CSS module classes are complete but opaque to the rule */}
        <div className='border-t border-border pt-16 md:pt-24'>
          <h2
            id='landing-how-heading'
            className={`max-w-[18ch] type-display-section text-balance text-foreground ${styles.revealItem}`}
          >
            How a plan comes together
          </h2>
          <ol className={cn('m-0 mt-12 list-none p-0', styles.routeSteps)}>
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className={cn(
                  'flex gap-4 md:flex-col md:gap-5',
                  styles.routeStep,
                  styles.revealItem,
                )}
                style={{ '--i': index + 1 } as CSSProperties}
              >
                <span aria-hidden='true' className={styles.routeMarker} />
                <div className='min-w-0'>
                  <p
                    aria-hidden='true'
                    className={cn(
                      'text-muted-foreground tabular-nums',
                      styles.mono,
                      styles.fine,
                    )}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </p>
                  <h3 className='mt-2 type-card text-foreground'>
                    {step.title}
                  </h3>
                  <p className='mt-2 max-w-[44ch] type-body text-muted-foreground'>
                    {step.copy}
                  </p>
                  <p
                    className={cn(
                      'mt-4 w-fit text-muted-foreground',
                      styles.mono,
                      styles.fine,
                      styles.chip,
                    )}
                  >
                    {step.example}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        {/* oxlint-enable shadcn/require-static-classes */}
      </RevealAnimation>
    </section>
  );
}
