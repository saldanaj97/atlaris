import { LiquidGlassButton } from '@/app/(marketing)/_shared/LiquidGlassButton';
import { marketingSecondaryCtaClassName } from '@/app/(marketing)/_shared/marketing-cta';
import { MarketingPageShell } from '@/app/(marketing)/_shared/MarketingPageShell';
import { StarField } from '@/app/(marketing)/_shared/StarField';
import { Reveal } from '@/app/(marketing)/landing/components/Reveal';
import { cn } from '@/lib/utils';
import { ArrowRight, BarChart3, ImageIcon, Sparkles } from 'lucide-react';
import Link from 'next/link';

import styles from './landing.module.css';

const landingEnterClassName =
  'animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-700 motion-reduce:animate-none';

const copy = {
  overline: 'The After-Hours Edition',
  headlineLead: 'Make space for',
  headlineEmphasis: 'the work that changes you.',
  subheadline: 'Plans, tasks, and analytics for the quiet hours.',
  primaryCta: 'Begin tonight',
  secondaryCta: 'See pricing',
} as const;

/**
 * After Hours landing — celestial atlas narrative.
 * Hero (unchanged) → drift problem → constellation route → instrument
 * screenshots → quiet questions → Polaris night banner.
 */
export function LandingDesignExplorer() {
  return (
    <MarketingPageShell withHeaderOffset className='bg-background'>
      <CelestialBackdrop />
      <div className='relative z-10'>
        <Hairline />
        <Hero />
        <Hairline />
        <DriftSection />
        <RouteSection />
        <InstrumentsSection />
        <QuestionsSection />
        <PolarisBanner />
      </div>
    </MarketingPageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Backdrop                                                            */
/* ------------------------------------------------------------------ */

function CelestialBackdrop() {
  return (
    <div
      className='pointer-events-none absolute inset-0 overflow-hidden text-foreground'
      aria-hidden='true'
    >
      {/* Warm dusk glow — top right, where the hero sits */}
      <div className='absolute -top-24 -right-16 size-136 rounded-full bg-primary/20 blur-3xl md:size-168' />
      {/* Plum horizon wash — mid left */}
      <div className='absolute top-[30%] -left-28 size-112 rounded-full bg-panel-muted/70 blur-3xl md:size-144' />
      {/* Faint parchment nebula — lower right */}
      <div className='absolute right-[-6%] bottom-[12%] size-96 rounded-full bg-card/80 blur-3xl' />
      <StarField />
    </div>
  );
}

function Hairline() {
  return <div className='h-px w-full bg-border/35' aria-hidden='true' />;
}

function SectionOverline({ children }: { children: string }) {
  return (
    <p className='font-serif text-[0.6875rem] font-medium tracking-[0.22em] text-primary uppercase sm:text-xs'>
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Hero (unchanged)                                                    */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section
      className='mx-auto flex max-w-4xl flex-col items-center px-6 pt-16 pb-12 text-center sm:pt-20 sm:pb-14 md:px-8'
      aria-labelledby='landing-hero-heading'
    >
      <p
        className={cn(
          landingEnterClassName,
          'font-serif text-[0.6875rem] font-medium tracking-[0.22em] text-muted-foreground uppercase sm:text-xs',
        )}
      >
        {copy.overline}
      </p>

      <h1
        id='landing-hero-heading'
        className={cn(
          landingEnterClassName,
          'mt-6 font-serif text-[2.75rem] leading-[1.08] font-semibold tracking-[-0.03em] text-foreground text-balance delay-150 sm:text-5xl md:text-[3.25rem]',
        )}
      >
        <span className='block'>{copy.headlineLead}</span>
        <span className='mt-1 block font-medium text-primary italic'>
          {copy.headlineEmphasis}
        </span>
      </h1>

      <p
        className={cn(
          landingEnterClassName,
          'mt-6 max-w-xl font-sans text-base leading-relaxed text-muted-foreground delay-300 sm:text-lg',
        )}
      >
        {copy.subheadline}
      </p>

      <div
        className={cn(
          landingEnterClassName,
          'mt-9 flex w-full max-w-md flex-col justify-center gap-3 delay-500 sm:max-w-none sm:flex-row sm:items-center',
        )}
      >
        <LiquidGlassButton asChild>
          <Link href='/plans/new'>
            {copy.primaryCta}
            <ArrowRight
              className='size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none'
              aria-hidden='true'
            />
          </Link>
        </LiquidGlassButton>
        <Link
          href='/pricing'
          className={cn(
            marketingSecondaryCtaClassName,
            'h-auto px-8 py-4 text-base',
          )}
        >
          {copy.secondaryCta}
        </Link>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Drift — the problem                                                 */
/* ------------------------------------------------------------------ */

function DriftSection() {
  return (
    <section
      className='mx-auto max-w-3xl px-6 py-16 text-center md:px-8 md:py-24'
      aria-labelledby='landing-drift-heading'
    >
      <Reveal>
        <SectionOverline>The drift</SectionOverline>
        <h2
          id='landing-drift-heading'
          className='mt-5 font-serif text-3xl font-semibold tracking-[-0.025em] text-balance text-foreground sm:text-4xl'
        >
          Ambition isn&apos;t your problem.
          <span className='block font-medium text-muted-foreground italic'>
            Drift is.
          </span>
        </h2>
      </Reveal>
      <Reveal delay={150}>
        <p className='mx-auto mt-6 max-w-xl font-sans text-base leading-relaxed text-muted-foreground sm:text-lg'>
          You&apos;ve started before. The course, the book, the certification.
          Two good weeks — then one busy Thursday, and the map goes dark. Not
          because you stopped caring. Because nothing was holding the route.
        </p>
      </Reveal>
      <Reveal delay={300}>
        <p className='mx-auto mt-4 max-w-xl font-serif text-base font-medium text-foreground sm:text-lg'>
          Atlaris holds the route.
        </p>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Route — how it works, drawn as a constellation                      */
/* ------------------------------------------------------------------ */

const ROUTE_STOPS = [
  {
    numeral: 'I',
    title: 'Set your star',
    copy: 'Name the goal, your level, and the hours you actually have. That is the whole setup — about two minutes.',
  },
  {
    numeral: 'II',
    title: 'Follow the route',
    copy: 'Atlaris charts a week-by-week plan: modules, tasks, and every resource attached to the work it supports.',
  },
  {
    numeral: 'III',
    title: 'Check your bearings',
    copy: 'Progress tracking shows what moved this week, so you return to a course — not a memory of one.',
  },
] as const;

function ConstellationRoute() {
  return (
    <svg
      viewBox='0 0 1000 120'
      fill='none'
      preserveAspectRatio='none'
      className='pointer-events-none absolute inset-x-0 top-10 hidden h-24 w-full md:block'
      aria-hidden='true'
    >
      <path
        d='M 60 90 C 250 20, 420 100, 500 60 C 580 20, 760 100, 940 40'
        stroke='var(--primary)'
        strokeOpacity='0.45'
        strokeWidth='1.5'
        strokeDasharray='1'
        pathLength={1}
        className={styles.routePath}
      />
      <circle
        cx='60'
        cy='90'
        r='5'
        fill='var(--primary)'
        className={cn(styles.routeNode, styles.routeNodeDelay1)}
      />
      <circle
        cx='500'
        cy='60'
        r='5'
        fill='var(--primary)'
        className={cn(styles.routeNode, styles.routeNodeDelay2)}
      />
      <circle
        cx='940'
        cy='40'
        r='5'
        fill='var(--primary)'
        className={cn(styles.routeNode, styles.routeNodeDelay3)}
      />
    </svg>
  );
}

function RouteSection() {
  return (
    <section
      className='mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-24'
      aria-labelledby='landing-route-heading'
    >
      <Reveal className='text-center'>
        <SectionOverline>The route</SectionOverline>
        <h2
          id='landing-route-heading'
          className='mt-5 font-serif text-3xl font-semibold tracking-[-0.025em] text-balance text-foreground sm:text-4xl'
        >
          Three moves. One steady course.
        </h2>
      </Reveal>

      <Reveal className='relative mt-14'>
        <ConstellationRoute />
        <div className='relative grid gap-10 md:grid-cols-3 md:gap-6 md:pt-28'>
          {ROUTE_STOPS.map((stop, index) => (
            <article key={stop.title} className='text-center md:text-left'>
              <p className='font-serif text-sm font-semibold tracking-[0.2em] text-primary'>
                {stop.numeral}
              </p>
              <h3 className='mt-3 font-serif text-xl font-semibold tracking-[-0.015em] text-foreground'>
                {stop.title}
              </h3>
              <p className='mx-auto mt-3 max-w-[18rem] font-sans text-sm leading-relaxed text-muted-foreground md:mx-0'>
                {stop.copy}
              </p>
              {index === 0 ? (
                <p className='mt-3 font-sans text-xs tracking-[0.08em] text-primary/80 uppercase'>
                  ~2 minutes
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Instruments — product proof with screenshot placeholders            */
/* ------------------------------------------------------------------ */

function ScreenshotPlaceholder({
  label,
  description,
  icon: Icon,
}: {
  label: string;
  description: string;
  icon: typeof ImageIcon;
}) {
  return (
    <figure className='flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 rounded-4xl border border-dashed border-panel-border/80 bg-card/60 px-8 text-center shadow-sm backdrop-blur-sm'>
      <Icon className='size-6 text-primary/70' aria-hidden='true' />
      <figcaption className='font-serif text-sm font-semibold text-foreground'>
        {label}
      </figcaption>
      <p className='max-w-sm font-sans text-xs leading-relaxed text-muted-foreground'>
        {description}
      </p>
    </figure>
  );
}

function InstrumentsSection() {
  return (
    <section
      className='mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-24'
      aria-labelledby='landing-instruments-heading'
    >
      <Reveal className='text-center'>
        <SectionOverline>The instruments</SectionOverline>
        <h2
          id='landing-instruments-heading'
          className='mt-5 font-serif text-3xl font-semibold tracking-[-0.025em] text-balance text-foreground sm:text-4xl'
        >
          Built for the nights you show up.
        </h2>
      </Reveal>

      {/* Plan detail — text left, screenshot right */}
      <Reveal delay={100}>
        <div className='mt-16 grid items-center gap-10 md:grid-cols-2 md:gap-14'>
          <div>
            <h3 className='font-serif text-2xl font-semibold tracking-[-0.02em] text-foreground'>
              A plan that remembers where you left off
            </h3>
            <p className='mt-4 font-sans text-base leading-relaxed text-muted-foreground'>
              Modules hold the tasks. Tasks hold the resources. Open Atlaris at
              9pm and tonight&apos;s work is already laid out — no re-deciding,
              no re-searching, no twenty open tabs.
            </p>
            <p className='mt-4 font-serif text-sm font-medium text-primary'>
              Sit down. Start where you stopped.
            </p>
          </div>
          <ScreenshotPlaceholder
            icon={ImageIcon}
            label='Screenshot: plan detail'
            description='The plan detail page showing a learning plan expanded into modules, with tasks and attached resources visible under the active module.'
          />
        </div>
      </Reveal>

      {/* Analytics — screenshot left, text right */}
      <Reveal delay={100}>
        <div className='mt-16 grid items-center gap-10 md:grid-cols-2 md:gap-14'>
          <ScreenshotPlaceholder
            icon={BarChart3}
            label='Screenshot: progress analytics'
            description='The analytics dashboard with weekly activity, completed modules, and usage trends charted over the past month.'
          />
          <div>
            <h3 className='font-serif text-2xl font-semibold tracking-[-0.02em] text-foreground'>
              Watch your sky fill in
            </h3>
            <p className='mt-4 font-sans text-base leading-relaxed text-muted-foreground'>
              Every finished task becomes a fixed point. Analytics turn
              scattered evenings into a visible trail — what you covered, when
              you covered it, and how far the route still runs.
            </p>
            <p className='mt-4 font-serif text-sm font-medium text-primary'>
              Momentum you can look at.
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Quiet questions — FAQ                                               */
/* ------------------------------------------------------------------ */

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

function QuestionsSection() {
  return (
    <section
      className='mx-auto max-w-3xl px-6 py-16 md:px-8 md:py-24'
      aria-labelledby='landing-questions-heading'
    >
      <Reveal className='text-center'>
        <SectionOverline>Quiet questions</SectionOverline>
        <h2
          id='landing-questions-heading'
          className='mt-5 font-serif text-3xl font-semibold tracking-[-0.025em] text-balance text-foreground sm:text-4xl'
        >
          Asked at 11pm, answered here.
        </h2>
      </Reveal>

      <Reveal delay={150}>
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
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Polaris — final CTA night panel                                     */
/* ------------------------------------------------------------------ */

function PolarisBanner() {
  return (
    <section className='px-6 pb-20 md:px-8 md:pb-28'>
      <Reveal>
        <div className='relative mx-auto max-w-5xl overflow-hidden rounded-4xl bg-foreground px-8 py-16 text-center text-background shadow-xl md:py-20'>
          <StarField />

          {/* Polaris — fixed point above the headline */}
          <div className='relative mx-auto flex justify-center'>
            <Sparkles
              className={cn('size-6 text-primary', styles.pulse)}
              aria-hidden='true'
            />
          </div>

          <h2 className='relative mt-6 font-serif text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl'>
            Polaris doesn&apos;t move.
            <span className='block font-medium italic opacity-80'>
              For one hour tonight, neither do you.
            </span>
          </h2>

          <p className='relative mx-auto mt-5 max-w-lg font-sans text-base leading-relaxed opacity-70'>
            Set the goal once. Let the quiet hours do the rest.
          </p>

          <div className='relative mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row'>
            <LiquidGlassButton asChild className={styles.drift}>
              <Link href='/plans/new'>
                Begin tonight
                <ArrowRight
                  className='size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none'
                  aria-hidden='true'
                />
              </Link>
            </LiquidGlassButton>
            <Link
              href='/pricing'
              className='font-serif text-sm font-medium underline-offset-4 opacity-80 transition-opacity hover:underline hover:opacity-100'
            >
              See pricing first
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
