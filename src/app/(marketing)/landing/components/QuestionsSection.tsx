import { RevealAnimation } from './RevealAnimation';
import { SectionOverline } from './SectionOverline';

import styles from './landing.module.css';

const QUESTIONS = [
  {
    question: 'How long before I have a plan?',
    answer:
      'About two minutes. Name the goal, your level, and the hours you actually have. Atlaris charts the route from there. You still have tonight for the work.',
  },
  {
    question: 'What if I fall off again?',
    answer:
      'The plan waits. Nothing expires. Nothing punishes you. Come back and pick up the next task — the route is exactly where you left it.',
  },
  {
    question: 'What if I only know the goal?',
    answer:
      'That is enough. Bring the destination — “learn TypeScript,” “pass the exam,” “ship the app.” Atlaris charts the modules, the order, and the resources. You open the next task, not a blank page.',
  },
  {
    question: 'Can I begin tonight without paying?',
    answer:
      'Yes. Create a plan free. See pricing when you want more plans or a route that runs longer.',
  },
] as const;

export function QuestionsSection() {
  return (
    <section
      className='mx-auto max-w-3xl px-6 py-16 md:px-8 md:py-24'
      aria-labelledby='landing-questions-heading'
    >
      <RevealAnimation>
        <div className='text-center'>
          <SectionOverline>Quiet questions</SectionOverline>
          <h2
            id='landing-questions-heading'
            className={`mt-5 font-serif text-3xl font-semibold tracking-[-0.025em] text-balance text-foreground sm:text-4xl ${styles.revealItem}`}
            style={{ ['--i' as string]: 1 }}
          >
            Asked at 11pm, answered here.
          </h2>
        </div>
      </RevealAnimation>

      <RevealAnimation>
        <div className='mt-10 divide-y divide-border/50 border-y border-border/50'>
          {QUESTIONS.map((item, index) => (
            <details
              key={item.question}
              className={`group py-5 ${styles.questionRow}`}
              style={{ ['--i' as string]: index }}
            >
              <summary className='flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm font-serif text-base font-semibold text-foreground transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden'>
                {item.question}
                <span
                  aria-hidden='true'
                  className='text-primary transition-transform duration-300 group-open:rotate-45 motion-reduce:transition-none'
                >
                  +
                </span>
              </summary>
              <p
                className={`mt-3 max-w-prose font-sans text-sm leading-relaxed text-muted-foreground ${styles.faqAnswer}`}
              >
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </RevealAnimation>
    </section>
  );
}
