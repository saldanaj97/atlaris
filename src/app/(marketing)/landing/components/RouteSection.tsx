import { RevealAnimation } from './RevealAnimation';
import { SectionOverline } from '@/components/ui/section-overline';
import { BarChart3, BookOpen, Check, Route, Wrench } from 'lucide-react';

import styles from './landing.module.css';

const ROUTE_FEATURES = [
  {
    title: 'Personalized routes',
    copy: 'Choose a goal and get a structured plan tailored to your level.',
    icon: Route,
  },
  {
    title: 'Practical projects',
    copy: 'Build real things and apply what you learn.',
    icon: Wrench,
  },
  {
    title: 'Curated resources',
    copy: 'Keep useful tutorials, documentation, and tools close at hand.',
    icon: BookOpen,
  },
  {
    title: 'Progress tracking',
    copy: 'See what moved and keep your next step in view.',
    icon: BarChart3,
  },
] as const;

export function RouteSection() {
  return (
    <section
      className='mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-24'
      aria-labelledby='landing-route-heading'
    >
      <RevealAnimation>
        <div className='mx-auto max-w-2xl text-center'>
          <SectionOverline className='justify-center'>
            Built for real progress
          </SectionOverline>
          <h2
            id='landing-route-heading'
            className={`mt-5 font-serif text-3xl leading-[1.08] font-semibold tracking-[-0.035em] text-balance text-foreground sm:text-4xl ${styles.revealItem}`}
            style={{ ['--i' as string]: 1 }}
          >
            Everything you need to{' '}
            <span className='text-primary italic'>stay on track.</span>
          </h2>
          <p
            className={`mx-auto mt-5 max-w-xl font-sans text-base leading-relaxed text-muted-foreground sm:text-lg ${styles.revealItem}`}
            style={{ ['--i' as string]: 2 }}
          >
            From guided learning plans to practical projects, Atlaris gives you
            the tools to turn knowledge into real skills.
          </p>
        </div>
      </RevealAnimation>

      <RevealAnimation>
        <div className='mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          {ROUTE_FEATURES.map(({ title, copy, icon: Icon }, index) => (
            <article
              key={title}
              className={`rounded-2xl border border-border/60 bg-card/70 p-5 shadow-sm ${styles.revealItem}`}
              style={{ ['--i' as string]: index }}
            >
              <span className='grid size-10 place-items-center rounded-xl border border-border/60 bg-panel-muted text-primary'>
                <Icon className='size-5' aria-hidden='true' />
              </span>
              <h3 className='mt-6 font-serif text-lg font-semibold tracking-[-0.02em] text-foreground'>
                {title}
              </h3>
              <p className='mt-2 text-sm leading-relaxed text-muted-foreground'>
                {copy}
              </p>
            </article>
          ))}
        </div>
      </RevealAnimation>

      <RevealAnimation>
        <ul
          className={`mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground ${styles.revealItem}`}
        >
          {[
            'Step-by-step guidance',
            'Real-world projects',
            'Track your progress',
          ].map((item) => (
            <li key={item} className='inline-flex items-center gap-2'>
              <Check className='size-4 text-primary' aria-hidden='true' />
              {item}
            </li>
          ))}
        </ul>
      </RevealAnimation>
    </section>
  );
}
