import type { ReactNode } from 'react';

import { LiquidGlassButton } from '@/app/(marketing)/_shared/LiquidGlassButton';
import { marketingGlassCardSurface } from '@/app/(marketing)/_shared/marketing-glass-surface';
import { MarketingPageShell } from '@/app/(marketing)/_shared/MarketingPageShell';
import { cn } from '@/lib/utils';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Clock3,
  Compass,
  FileText,
  TrendingUp,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

const landingCardClassName = cn(
  'rounded-3xl shadow-sm backdrop-blur-xl',
  marketingGlassCardSurface,
);

const appShots = {
  plans: '/marketing/app-screenshots/plans.png',
  dashboard: '/marketing/app-screenshots/dashboard.png',
  analytics: '/marketing/app-screenshots/analytics.png',
};

const landing = {
  heroKicker: 'Plans, tasks, and analytics in one workspace',
  headline: 'Where goals and progress',
  highlight: 'jam together',
  subheadline:
    'Atlaris gives each learning goal a visible plan, then turns completion into progress signals you can read at a glance.',
  primaryCta: 'Create a plan free',
  secondaryCta: 'Open pricing',
  image: appShots.analytics,
  imageAlt: 'Atlaris usage analytics with weekly progress chart',
  proof: [
    'Tasks and modules',
    'Estimated completed time',
    'Weekly progress changes',
  ],
  problemTitle: 'The hard part is not finding content. It is keeping context.',
  problemCopy:
    'Atlaris keeps the plan, current task, and progress history close enough that you do not restart from memory every session.',
  howTitle: 'Connect the learning pieces',
  benefitTitle: 'Know what changed',
  audienceTitle: 'Works across learning styles',
  finalTitle: 'Stop restarting the plan from scratch.',
  finalCopy:
    'Create the roadmap once, then let your workspace show what to do next.',
  sections: {
    pain: [
      'You lose the reason behind each saved resource.',
      'Completed work disappears into memory.',
      'The next task is unclear after a few days away.',
    ],
    steps: [
      {
        icon: 'file',
        title: 'Capture the context',
        copy: 'Goal, level, schedule, and focus area become the plan input.',
      },
      {
        icon: 'book',
        title: 'Study from the plan',
        copy: 'Resources stay attached to the work they support.',
      },
      {
        icon: 'chart',
        title: 'Read the pulse',
        copy: 'Usage analytics show current completion and recent progress changes.',
      },
    ],
    benefits: [
      {
        icon: 'clock',
        title: 'Estimated time is explicit',
        copy: 'Atlaris labels completed learning time as estimated, not invented history.',
      },
      {
        icon: 'trend',
        title: 'Signals over noise',
        copy: 'The dashboard shows recent learning activity without burying the plan.',
      },
      {
        icon: 'compass',
        title: 'Easy re-entry',
        copy: 'Come back to the active plan instead of rebuilding your own context.',
      },
    ],
    audiences: [
      {
        title: 'College support',
        copy: 'Add structure around a course without replacing the syllabus.',
      },
      {
        title: 'Professional growth',
        copy: 'Turn a development goal into something visible each week.',
      },
      {
        title: 'Weekend learning',
        copy: 'Make a plan small enough to survive a busy calendar.',
      },
    ],
  },
} as const;

const comparisonRows = [
  {
    label: 'Saved links',
    copy: 'Resources exist, but the route is yours to invent.',
    highlight: false,
  },
  {
    label: 'Generic courses',
    copy: 'The sequence is fixed, even when your time is not.',
    highlight: false,
  },
  {
    label: 'Atlaris',
    copy: 'The plan starts from your goal, level, and weekly capacity.',
    highlight: true,
  },
];

type LandingIconName =
  | (typeof landing.sections.steps)[number]['icon']
  | (typeof landing.sections.benefits)[number]['icon'];

function LandingIcon({
  name,
  className,
}: {
  name: LandingIconName;
  className: string;
}) {
  switch (name) {
    case 'file':
      return <FileText className={className} aria-hidden='true' />;
    case 'book':
      return <BookOpen className={className} aria-hidden='true' />;
    case 'chart':
      return <BarChart3 className={className} aria-hidden='true' />;
    case 'clock':
      return <Clock3 className={className} aria-hidden='true' />;
    case 'trend':
      return <TrendingUp className={className} aria-hidden='true' />;
    case 'compass':
      return <Compass className={className} aria-hidden='true' />;
  }
}

const faq = [
  {
    question: 'Does Atlaris replace courses?',
    answer:
      'No. It turns a goal into a plan and can point each lesson toward resources. Courses can still be part of the plan.',
  },
  {
    question: 'Is calendar sync live?',
    answer:
      'Not yet. Atlaris is designed around time-blocked sessions now, with calendar sync still marked as coming soon.',
  },
  {
    question: 'Are the analytics historical?',
    answer:
      'Current completion and progress changes are available. Atlaris avoids pretending it has historical study time that was never recorded.',
  },
];

export function LandingDesignExplorer() {
  return (
    <MarketingPageShell withHeaderOffset className='[letter-spacing:0]'>
      <main className='overflow-hidden'>
        <Hero />
        <ProofBar />
        <ProblemSection />
        <HowItWorks />
        <Benefits />
        <ProductTour />
        <AudienceSection />
        <Comparison />
        <Faq />
        <FinalCta />
      </main>
    </MarketingPageShell>
  );
}

function Hero() {
  return (
    <section className='mx-auto grid min-h-[calc(100svh-10rem)] max-w-7xl items-center gap-10 px-6 pt-10 pb-12 md:px-8 lg:block lg:pt-16'>
      <div className='relative z-10 lg:text-center'>
        <p className='mb-5 text-sm font-semibold text-primary uppercase'>
          {landing.heroKicker}
        </p>
        <h1 className='mx-auto max-w-4xl text-5xl leading-[1.02] font-black [letter-spacing:0] text-balance text-foreground sm:text-6xl lg:text-7xl'>
          {landing.headline}{' '}
          <span className='inline-flex rounded-[1.2rem] bg-muted px-4 text-primary dark:bg-primary/15'>
            {landing.highlight}
          </span>
        </h1>
        <p className='mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground'>
          {landing.subheadline}
        </p>
        <div className='mt-8 flex flex-col justify-center gap-3 sm:flex-row'>
          <PrimaryLink href='/plans/new'>{landing.primaryCta}</PrimaryLink>
          <SecondaryLink href='/pricing'>{landing.secondaryCta}</SecondaryLink>
        </div>
      </div>

      <div className='relative mt-10 lg:mt-12'>
        <ScreenshotFrame className='mx-auto max-w-6xl'>
          <AppScreenshot src={landing.image} alt={landing.imageAlt} priority />
        </ScreenshotFrame>
      </div>
    </section>
  );
}

function ScreenshotFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-4xl border border-white/40 bg-card shadow-2xl dark:border-white/10',
        className,
      )}
    >
      <div
        className='flex h-9 items-center justify-between border-b border-border/60 px-4'
        aria-hidden='true'
      >
        <div className='flex gap-2'>
          <span className='size-2.5 rounded-full bg-destructive' />
          <span className='size-2.5 rounded-full bg-warning' />
          <span className='size-2.5 rounded-full bg-success' />
        </div>
        <span className='text-xs font-semibold text-muted-foreground'>
          atlaris.app
        </span>
        <span className='h-2 w-10 rounded-full bg-muted' />
      </div>
      <div className='aspect-16/10 overflow-hidden'>{children}</div>
    </div>
  );
}

function ProofBar() {
  return (
    <section className='border-y border-border/60 bg-white/60 backdrop-blur dark:bg-card/40'>
      <div className='mx-auto grid max-w-7xl gap-3 px-6 py-5 sm:grid-cols-3 md:px-8'>
        {landing.proof.map((item) => (
          <div
            key={item}
            className='flex items-center gap-3 text-sm font-semibold text-muted-foreground'
          >
            <span className='size-2 rounded-full bg-primary' />
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

function ProblemSection() {
  return (
    <Section
      eyebrow='The problem'
      title={landing.problemTitle}
      copy={landing.problemCopy}
    >
      <div className='grid gap-4 md:grid-cols-3'>
        {landing.sections.pain.map((pain) => (
          <div key={pain} className={cn(landingCardClassName, 'p-6')}>
            <span className='mb-5 flex size-10 items-center justify-center rounded-2xl bg-muted text-primary dark:bg-primary/15'>
              <Clock3 className='size-5' aria-hidden='true' />
            </span>
            <p className='text-base leading-7 text-muted-foreground'>{pain}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function HowItWorks() {
  return (
    <Section eyebrow='How it works' title={landing.howTitle}>
      <div className='grid gap-5 lg:grid-cols-3'>
        {landing.sections.steps.map((step, index) => (
          <StepCard key={step.title} step={step} index={index} />
        ))}
      </div>
    </Section>
  );
}

function StepCard({
  step,
  index,
}: {
  step: (typeof landing.sections.steps)[number];
  index: number;
}) {
  return (
    <article className={cn(landingCardClassName, 'p-6')}>
      <div className='mb-6 flex items-center justify-between'>
        <span className='flex size-12 items-center justify-center rounded-2xl bg-primary-dark text-lg font-black text-primary-foreground'>
          {index + 1}
        </span>
        <LandingIcon name={step.icon} className='size-6 text-primary' />
      </div>
      <h3 className='text-2xl font-black [letter-spacing:0] text-foreground'>
        {step.title}
      </h3>
      <p className='mt-3 leading-7 text-muted-foreground'>{step.copy}</p>
    </article>
  );
}

function Benefits() {
  return (
    <Section eyebrow='Benefits' title={landing.benefitTitle}>
      <div className='grid gap-5 md:grid-cols-3'>
        {landing.sections.benefits.map((benefit) => {
          return (
            <article
              key={benefit.title}
              className='rounded-3xl bg-muted p-6 dark:bg-primary/10'
            >
              <LandingIcon
                name={benefit.icon}
                className='mb-6 size-7 text-primary'
              />
              <h3 className='text-xl font-black [letter-spacing:0] text-foreground'>
                {benefit.title}
              </h3>
              <p className='mt-3 leading-7 text-muted-foreground'>
                {benefit.copy}
              </p>
            </article>
          );
        })}
      </div>
    </Section>
  );
}

function ProductTour() {
  return (
    <Section
      eyebrow='Product tour'
      title='The app surfaces match the promise'
      copy='Plans, activity, and analytics are separate views of the same learning workflow.'
    >
      <div className='grid gap-5 lg:grid-cols-3'>
        <MiniShot
          src={appShots.plans}
          title='Plans'
          copy='Search, filter, and continue learning plans.'
        />
        <MiniShot
          src={appShots.dashboard}
          title='Activity feed'
          copy='Resume the most recent plan and review recent progress.'
        />
        <MiniShot
          src={appShots.analytics}
          title='Usage'
          copy='See current completion and weekly progress changes.'
        />
      </div>
      <div
        className={cn(
          landingCardClassName,
          'mt-6 p-5 text-sm leading-7 text-muted-foreground',
        )}
      >
        Calendar sync is intentionally described as coming soon. This page does
        not promise shipped calendar integration.
      </div>
    </Section>
  );
}

function MiniShot({
  src,
  title,
  copy,
}: {
  src: string;
  title: string;
  copy: string;
}) {
  return (
    <article
      className={cn(
        landingCardClassName,
        'overflow-hidden bg-white/70 shadow-sm dark:bg-card/50',
      )}
    >
      <AppScreenshot
        src={src}
        alt={`Atlaris ${title} screenshot`}
        className='aspect-16/10'
      />
      <div className='p-5'>
        <h3 className='text-xl font-black [letter-spacing:0] text-foreground'>
          {title}
        </h3>
        <p className='mt-2 leading-7 text-muted-foreground'>{copy}</p>
      </div>
    </article>
  );
}

function AppScreenshot({
  src,
  alt,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={1440}
      height={1000}
      className={cn('h-full w-full object-cover', className)}
      priority={priority}
    />
  );
}

function AudienceSection() {
  return (
    <Section
      eyebrow='Use cases'
      title={landing.audienceTitle}
      copy='Illustrative scenarios only, not customer testimonials.'
    >
      <div className='grid gap-5 md:grid-cols-3'>
        {landing.sections.audiences.map((audience) => (
          <article
            key={audience.title}
            className={cn(landingCardClassName, 'p-6')}
          >
            <h3 className='text-2xl font-black [letter-spacing:0] text-foreground'>
              {audience.title}
            </h3>
            <p className='mt-3 leading-7 text-muted-foreground'>
              {audience.copy}
            </p>
          </article>
        ))}
      </div>
    </Section>
  );
}

function Comparison() {
  return (
    <Section
      eyebrow='Compare'
      title='Compared with the usual workaround'
      copy='The difference is not more content. It is a plan that stays connected to action.'
    >
      <div
        className={cn(
          landingCardClassName,
          'overflow-hidden bg-white/80 dark:bg-card/50',
        )}
      >
        {comparisonRows.map(({ label, copy, highlight }) => (
          <div
            key={label}
            className='grid gap-4 border-b border-border/60 p-5 last:border-b-0 md:grid-cols-[220px_1fr]'
          >
            <div
              className={cn(
                'font-black [letter-spacing:0]',
                highlight ? 'text-primary' : 'text-foreground',
              )}
            >
              {label}
            </div>
            <p className='leading-7 text-muted-foreground'>{copy}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Faq() {
  return (
    <Section eyebrow='FAQ' title='Questions worth answering before signup'>
      <div className='grid gap-4 md:grid-cols-3'>
        {faq.map((item) => (
          <article
            key={item.question}
            className={cn(landingCardClassName, 'p-6')}
          >
            <h3 className='text-lg font-black [letter-spacing:0] text-foreground'>
              {item.question}
            </h3>
            <p className='mt-3 leading-7 text-muted-foreground'>
              {item.answer}
            </p>
          </article>
        ))}
      </div>
    </Section>
  );
}

function FinalCta() {
  return (
    <section className='px-6 py-20 md:px-8'>
      <div className='mx-auto max-w-5xl rounded-4xl border border-transparent bg-foreground p-8 text-center text-background shadow-2xl md:p-12 dark:border-white/10 dark:bg-card dark:text-foreground'>
        <p className='text-sm font-bold text-primary uppercase dark:text-accent-foreground'>
          Start with one plan
        </p>
        <h2 className='mt-4 text-4xl font-black [letter-spacing:0] text-balance md:text-6xl'>
          {landing.finalTitle}
        </h2>
        <p className='mx-auto mt-5 max-w-2xl text-lg leading-8 text-background/75 dark:text-muted-foreground'>
          {landing.finalCopy}
        </p>
        <div className='mt-8 flex justify-center'>
          <PrimaryLink href='/plans/new'>{landing.primaryCta}</PrimaryLink>
        </div>
      </div>
    </section>
  );
}

function Section({
  eyebrow,
  title,
  copy,
  children,
}: {
  eyebrow: string;
  title: string;
  copy?: string;
  children: ReactNode;
}) {
  return (
    <section className='px-6 py-16 md:px-8'>
      <div className='mx-auto max-w-7xl'>
        <div className='mb-10 max-w-3xl'>
          <p className='text-sm font-bold text-primary uppercase'>{eyebrow}</p>
          <h2 className='mt-3 text-4xl leading-tight font-black [letter-spacing:0] text-balance text-foreground md:text-5xl'>
            {title}
          </h2>
          {copy ? (
            <p className='mt-4 text-lg leading-8 text-muted-foreground'>
              {copy}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </section>
  );
}

function PrimaryLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <LiquidGlassButton asChild>
      <Link href={href}>
        {children}
        <ArrowRight className='ml-2 size-4' aria-hidden='true' />
      </Link>
    </LiquidGlassButton>
  );
}

function SecondaryLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className='inline-flex items-center justify-center rounded-full border border-white/40 bg-white/70 px-6 py-3 text-sm font-bold text-foreground shadow-sm transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-card/40'
    >
      {children}
    </Link>
  );
}
