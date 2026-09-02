import { RevealAnimation } from './RevealAnimation';
import { SectionOverline } from './SectionOverline';

import styles from './about.module.css';

const IT_DOES = [
  'Draft the route from your goal, your level, and your weekly hours.',
  'Break the work into modules and tasks sized for the time you named.',
  'Attach resources to the work they support.',
  'Write a lesson for a module when you ask for one.',
  'Remember what you finished and where you stopped.',
] as const;

const IT_DOES_NOT = [
  'Grade you.',
  'Punish a missed night. The plan waits, and nothing expires.',
  'Decide what you should want to learn.',
  'Replace your own judgment. If a step is wrong for you, leave it and move on.',
  'Promise a result. It is a map, not the walk.',
] as const;

export function MethodSection() {
  return (
    <section
      className='mx-auto max-w-3xl px-6 py-16 md:px-8 md:py-24'
      aria-labelledby='about-method-heading'
    >
      <RevealAnimation>
        <div className='text-center'>
          <SectionOverline>The method</SectionOverline>
          <h2
            id='about-method-heading'
            className={`mt-5 font-serif text-3xl font-semibold tracking-[-0.025em] text-balance text-foreground sm:text-4xl ${styles.revealItem}`}
            style={{ ['--i' as string]: 1 }}
          >
            What the AI does.
            <span className='block font-medium text-muted-foreground italic'>
              And what it leaves to you.
            </span>
          </h2>
          <p
            className={`mx-auto mt-6 max-w-xl font-sans text-base leading-relaxed text-muted-foreground sm:text-lg ${styles.revealItem}`}
            style={{ ['--i' as string]: 2 }}
          >
            You give Atlaris a goal, your level, the hours you have each week,
            and how you like to learn. An AI model drafts a week-by-week route
            from that: modules, tasks, and the resources attached to each. It
            takes about two minutes. The draft is a starting point, not a
            verdict.
          </p>
        </div>
      </RevealAnimation>

      <RevealAnimation>
        <div
          className={`mt-10 rounded-4xl border border-border/50 bg-card p-6 shadow-sm md:p-7 ${styles.revealItem}`}
        >
          <div className='grid gap-8 md:grid-cols-2'>
            <MethodList title='It does' items={IT_DOES} />
            <MethodList title='It does not' items={IT_DOES_NOT} />
          </div>
        </div>
        <p className='mt-4 text-center font-sans text-xs text-muted-foreground'>
          Plans are private to your account. Email reminders stay off until you
          turn them on.
        </p>
      </RevealAnimation>
    </section>
  );
}

function MethodList({
  title,
  items,
}: {
  title: string;
  items: readonly string[];
}) {
  return (
    <div>
      <h3 className='font-serif text-sm font-medium text-primary'>{title}</h3>
      <ul className='mt-4 space-y-3 font-sans text-sm leading-relaxed text-muted-foreground'>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
