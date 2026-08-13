'use client';

import { StarField } from '@/app/(marketing)/_shared/StarField';
import BrandLogo from '@/components/shared/BrandLogo';
import { ROUTES } from '@/features/navigation';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  CalendarDays,
  Check,
  Compass,
  Map,
  Menu,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useState, type FormEvent, type ReactNode } from 'react';

import styles from './cinematic-atlas-hero.module.css';

const EASE_ENTRANCE = [0.16, 1, 0.3, 1] as const;
const EASE_WAVE = [0.25, 1, 0.5, 1] as const;

const NAV_ITEMS = [
  { label: 'Home', href: ROUTES.LANDING },
  { label: 'Route', href: ROUTES.LANDING + '#landing-route-heading' },
  {
    label: 'Instruments',
    href: ROUTES.LANDING + '#landing-instruments-heading',
  },
  { label: 'Questions', href: ROUTES.LANDING + '#landing-questions-heading' },
  { label: 'Pricing', href: ROUTES.PRICING },
] as const;

const HEADING_WORDS = [
  { text: 'A', emphasis: false, breakAfter: false },
  { text: 'map', emphasis: false, breakAfter: false },
  { text: 'for', emphasis: false, breakAfter: true },
  { text: 'the', emphasis: false, breakAfter: false },
  { text: 'quiet', emphasis: true, breakAfter: false },
  { text: 'hours', emphasis: false, breakAfter: false },
] as const;

const FEATURES = [
  { label: 'Chart a route', icon: Map },
  { label: 'Keep the week', icon: CalendarDays },
  { label: 'Read your bearings', icon: Compass },
] as const;

const heroContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
};

const heroItem = {
  hidden: { y: 40, opacity: 0 },
  show: {
    y: 0,
    opacity: 1,
    transition: { duration: 1.2, ease: EASE_ENTRANCE },
  },
};

type CaptureState =
  | { kind: 'editing'; submitting: boolean }
  | { kind: 'success' };

type CinematicAtlasHeroProps = {
  /** Simulated pause before the success swap. */
  submitDelayMs?: number;
};

export function CinematicAtlasHero({
  submitDelayMs = 1000,
}: CinematicAtlasHeroProps) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion() === true;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <section
      id='cinematic-atlas-hero'
      aria-labelledby='cinematic-atlas-heading'
      className='relative flex h-full min-h-screen w-full flex-col justify-between overflow-hidden bg-background px-6 pt-5 pb-8 text-foreground min-[1440px]:px-16 md:px-12'
    >
      <CinematicSkyLayer />

      <motion.nav
        aria-label='Cinematic atlas'
        className='relative z-20 flex w-full items-center justify-between gap-4 md:gap-12'
        initial={reduceMotion ? false : { y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1.1, ease: EASE_ENTRANCE }}
      >
        <BrandLogo size='sm' onClick={() => setMenuOpen(false)} />

        <div className='hidden items-center gap-7 rounded-full border border-border/60 bg-card/40 px-4 py-1 backdrop-blur-md lg:flex'>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.label}
              href={item.href}
              label={item.label}
              active={isNavActive(pathname, item.href)}
            />
          ))}
        </div>

        <div className='hidden w-[225px] items-center justify-end gap-4 lg:flex'>
          <Link
            href='/auth/sign-in'
            className='font-sans text-[18px] tracking-[-0.2px] text-foreground/80 hover:text-foreground'
          >
            <WaveLabel text='Sign in' />
          </Link>
          <Link
            href={ROUTES.PLANS.NEW}
            className='rounded-lg border border-border/70 bg-primary px-4 py-[9px] font-sans text-[18px] tracking-[-0.2px] text-primary-foreground shadow-md shadow-primary/20'
          >
            <WaveLabel text='Begin tonight' />
          </Link>
        </div>

        <button
          type='button'
          className='flex rounded-lg border border-border/70 bg-card/40 p-2 backdrop-blur-md md:p-2.5 lg:hidden'
          aria-expanded={menuOpen}
          aria-controls='cinematic-atlas-mobile-menu'
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X className='size-5' /> : <Menu className='size-5' />}
        </button>
      </motion.nav>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            key='cinematic-atlas-mobile-menu'
            id='cinematic-atlas-mobile-menu'
            className={cn(
              styles.capsule,
              'absolute top-[72px] right-4 left-4 z-50 rounded-2xl bg-card/95 p-5 shadow-2xl backdrop-blur-xl md:top-[84px] md:right-6 md:left-6 md:rounded-[20px] md:p-8',
            )}
            initial={reduceMotion ? false : { opacity: 0, y: -20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            transition={{ duration: 0.4, ease: EASE_ENTRANCE }}
          >
            <div className='flex flex-col gap-4'>
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.label}
                  href={item.href}
                  label={item.label}
                  active={isNavActive(pathname, item.href)}
                  onNavigate={() => setMenuOpen(false)}
                />
              ))}
              <Link
                href='/auth/sign-in'
                className='font-sans text-[18px] tracking-[-0.2px] text-foreground/80'
                onClick={() => setMenuOpen(false)}
              >
                <WaveLabel text='Sign in' />
              </Link>
              <Link
                href={ROUTES.PLANS.NEW}
                className='rounded-lg border border-border/70 bg-primary px-4 py-[9px] text-center font-sans text-[18px] tracking-[-0.2px] text-primary-foreground'
                onClick={() => setMenuOpen(false)}
              >
                <WaveLabel text='Begin tonight' />
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div
        className='relative z-10 flex flex-1 flex-col items-center pt-[8vh] pb-16 text-center md:pt-24 md:pb-28 lg:pt-24 lg:pb-32'
        variants={heroContainer}
        initial={reduceMotion ? false : 'hidden'}
        animate='show'
      >
        <div className='flex w-full max-w-[670px] flex-col items-center'>
          <motion.p
            variants={heroItem}
            className='flex items-center gap-2.5 font-sans text-[15px] tracking-[-0.72px] text-muted-foreground sm:text-[18px]'
          >
            <span className='flex -space-x-1.5' aria-hidden='true'>
              <span className='size-6 rounded-full border border-primary/70 bg-primary/80' />
              <span className='size-6 rounded-full border border-primary/70 bg-primary' />
              <span className='size-6 rounded-full border border-primary/70 bg-primary/60' />
            </span>
            <span>For the hour after the day lets go</span>
          </motion.p>

          <motion.h1
            id='cinematic-atlas-heading'
            variants={heroItem}
            className='mt-2.5 font-serif text-[2.75rem] leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-5xl md:text-[3.25rem]'
          >
            <span className='sr-only'>A map for the quiet hours</span>
            <span aria-hidden='true'>
              {HEADING_WORDS.map((word) => (
                <span key={word.text}>
                  <WaveLabel
                    text={word.text}
                    className={
                      word.emphasis
                        ? 'font-medium text-primary italic'
                        : 'text-foreground'
                    }
                  />
                  {word.breakAfter ? <br className='block lg:hidden' /> : null}
                  {word.text === 'hours' ? null : ' '}
                </span>
              ))}
            </span>
          </motion.h1>

          <motion.p
            variants={heroItem}
            className='mt-4 max-w-[630px] font-sans text-xl leading-[140%] tracking-[-0.4px] text-foreground/90'
          >
            Name a goal and the hours you actually have. Atlaris charts a
            week-by-week plan — modules, tasks, and resources — so tonight is
            already laid out.
          </motion.p>

          <motion.div
            variants={heroItem}
            className='mt-10 w-full max-w-[530px]'
          >
            <EmailCapture
              submitDelayMs={submitDelayMs}
              reduceMotion={reduceMotion}
            />
          </motion.div>

          <motion.ul
            variants={heroItem}
            className='mt-5 flex flex-col gap-4 sm:flex-row sm:gap-12'
          >
            {FEATURES.map((feature) => (
              <li
                key={feature.label}
                className='flex items-center justify-center gap-2 font-sans text-base tracking-[-0.2px] text-foreground'
              >
                <feature.icon
                  className='size-5 text-primary'
                  aria-hidden='true'
                />
                <WaveLabel text={feature.label} />
              </li>
            ))}
          </motion.ul>
        </div>
      </motion.div>
    </section>
  );
}

function CinematicSkyLayer() {
  return (
    <div className='absolute inset-0 z-0 overflow-hidden' aria-hidden='true'>
      <div className={styles.skyFilm}>
        <div className='absolute -top-[20%] left-[8%] size-[78%] rounded-full bg-primary/25 blur-3xl' />
        <div className='absolute top-[28%] -right-[12%] size-[68%] rounded-full bg-panel-muted/80 blur-3xl' />
        <div className='absolute -bottom-[18%] left-[18%] size-[58%] rounded-full bg-card/90 blur-3xl' />
      </div>
      <StarField className='text-foreground' />
      <div className={styles.grain} />
      <div className='absolute inset-0 bg-background/15' />
      <div className='absolute inset-0 bg-linear-to-b from-background/20 via-transparent to-background/40' />
    </div>
  );
}

function NavLink({
  href,
  label,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(
        'font-sans text-[18px] tracking-[-0.2px]',
        active
          ? 'font-semibold text-foreground'
          : 'font-normal text-foreground/80',
      )}
    >
      <WaveLabel text={label} />
    </Link>
  );
}

function isNavActive(pathname: string, href: string): boolean {
  if (href === ROUTES.PRICING) {
    return pathname === ROUTES.PRICING;
  }
  if (href === ROUTES.LANDING) {
    return (
      pathname === ROUTES.HOME ||
      pathname === ROUTES.LANDING ||
      pathname.startsWith(ROUTES.LANDING + '/')
    );
  }
  return false;
}

function WaveLabel({ text, className }: { text: string; className?: string }) {
  const [isHovered, setIsHovered] = useState(false);
  const reduceMotion = useReducedMotion() === true;
  const characters = Array.from(text);

  return (
    <span
      className={cn('inline-flex', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span className='sr-only'>{text}</span>
      {characters.map((char, index) => {
        const display = char === ' ' ? '\u00A0' : char;
        return (
          <motion.span
            key={text + String(index)}
            className={styles.waveChar}
            aria-hidden='true'
            initial={reduceMotion ? false : { y: 100, x: -100, opacity: 0 }}
            whileInView={{ y: 0, x: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.8, ease: EASE_ENTRANCE }}
          >
            <motion.span
              className='inline-block'
              animate={
                isHovered && !reduceMotion
                  ? { y: '-100%', x: '100%', opacity: 0 }
                  : { y: '0%', x: '0%', opacity: 1 }
              }
              transition={{
                duration: 0.35,
                delay: index * 0.015,
                ease: EASE_WAVE,
              }}
            >
              {display}
            </motion.span>
            <motion.span
              className='absolute inset-0 inline-block'
              initial={{ y: '100%', x: '-100%', opacity: 0 }}
              animate={
                isHovered && !reduceMotion
                  ? { y: '0%', x: '0%', opacity: 1 }
                  : { y: '100%', x: '-100%', opacity: 0 }
              }
              transition={{
                duration: 0.45,
                delay: index * 0.015,
                ease: EASE_WAVE,
              }}
              aria-hidden='true'
            >
              {display}
            </motion.span>
          </motion.span>
        );
      })}
    </span>
  );
}

function EmailCapture({
  submitDelayMs,
  reduceMotion,
}: {
  submitDelayMs: number;
  reduceMotion: boolean;
}) {
  const emailId = useId();
  const [email, setEmail] = useState('');
  const [capture, setCapture] = useState<CaptureState>({
    kind: 'editing',
    submitting: false,
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (capture.kind !== 'editing' || capture.submitting) {
      return;
    }
    setCapture({ kind: 'editing', submitting: true });
    await wait(submitDelayMs);
    setCapture({ kind: 'success' });
  }

  const signUpHref =
    '/auth/sign-up?email_address=' + encodeURIComponent(email.trim());

  let captureView: ReactNode;
  switch (capture.kind) {
    case 'editing':
      captureView = (
        <motion.form
          key='cinematic-atlas-email-form'
          onSubmit={onSubmit}
          className='flex items-center gap-2 rounded-xl border border-border/80 bg-card/30 p-1 pl-2 sm:pl-4'
          initial={false}
          exit={{ opacity: 0, y: -8 }}
        >
          <label htmlFor={emailId} className='sr-only'>
            Email
          </label>
          <input
            id={emailId}
            name='email'
            type='email'
            required
            autoComplete='email'
            placeholder='Enter your email...'
            value={email}
            disabled={capture.submitting}
            onChange={(event) => setEmail(event.target.value)}
            className='min-w-0 flex-1 bg-transparent py-3 font-sans text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50'
          />
          <button
            type='submit'
            disabled={capture.submitting}
            className='inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-border/70 bg-primary px-3 py-3 font-sans text-sm font-medium text-primary-foreground sm:px-4'
          >
            <WaveLabel
              text={capture.submitting ? 'Charting...' : 'Begin tonight'}
            />
            <ArrowRight className='size-4' aria-hidden='true' />
          </button>
        </motion.form>
      );
      break;
    case 'success':
      captureView = (
        <motion.output
          key='cinematic-atlas-email-success'
          className='flex flex-wrap items-center justify-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-4 font-sans text-sm text-success'
          initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          <Check className='size-4' aria-hidden='true' />
          <span>Continue to Atlaris — we&apos;ll hold the route.</span>
          <Link
            href={signUpHref}
            className='font-medium underline-offset-4 hover:underline'
          >
            Create your account
          </Link>
        </motion.output>
      );
      break;
    default: {
      const _exhaustive: never = capture;
      throw new Error('Unhandled capture state: ' + String(_exhaustive));
    }
  }

  return <AnimatePresence mode='wait'>{captureView}</AnimatePresence>;
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
