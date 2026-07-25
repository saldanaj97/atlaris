import { SectionOverline } from './SectionOverline';

const QUESTIONS = [
  {
    question: 'How long does setup take?',
    answer:
      'About two minutes. You give Atlaris a goal, your current level, and your weekly hours — it drafts the full plan from there. You can regenerate or adjust it any time.',
  },
  {
    question: 'What if my week falls apart?',
    answer:
      'The plan waits. Nothing expires, nothing punishes you. When you come back, the route is exactly where you left it — pick up the next task and keep moving.',
  },
  {
    question: 'Do I need to know what to study?',
    answer:
      'No. Bring the destination — “learn TypeScript,” “pass the exam,” “ship the app.” Atlaris charts the modules, the order, and the resources for each step.',
  },
  {
    question: 'Can I try it before paying?',
    answer:
      'Yes. Create your first plan free, and see the pricing page for where each tier picks up.',
  },
] as const;

export function QuestionsSection() {
  return (
    <section
      className='mx-auto max-w-3xl px-6 py-16 md:px-8 md:py-24'
      aria-labelledby='landing-questions-heading'
    >
      <div className='text-center'>
        <SectionOverline>Quiet questions</SectionOverline>
        <h2
          id='landing-questions-heading'
          className='mt-5 font-serif text-3xl font-semibold tracking-[-0.025em] text-balance text-foreground sm:text-4xl'
        >
          Asked at 11pm, answered here.
        </h2>
      </div>

      <div className='mt-10 divide-y divide-border/50 border-y border-border/50'>
        {QUESTIONS.map((item) => (
          <details key={item.question} className='group py-5'>
            <summary className='flex cursor-pointer list-none items-center justify-between gap-4 font-serif text-base font-semibold text-foreground transition-colors hover:text-primary [&::-webkit-details-marker]:hidden'>
              {item.question}
              <span
                aria-hidden='true'
                className='text-primary transition-transform duration-300 group-open:rotate-45 motion-reduce:transition-none'
              >
                +
              </span>
            </summary>
            <p className='mt-3 max-w-prose font-sans text-sm leading-relaxed text-muted-foreground'>
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
