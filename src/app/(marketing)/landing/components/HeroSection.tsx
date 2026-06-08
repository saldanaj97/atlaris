import type { JSX } from 'react';

import { marketingPrimaryCtaClassName } from '@/app/(marketing)/_shared/marketing-cta';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ArrowRight, BookOpen, Calendar, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';

const heroEnterClassName =
  'motion-reduce:animate-none animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-700';

export function HeroSection(): JSX.Element {
  const headingId = useId();

  return (
    <section className='relative' aria-labelledby={headingId}>
      <div className='relative z-10 mx-auto flex flex-col items-center px-6 pt-6 pb-48 text-center sm:pt-8 lg:min-h-screen lg:justify-center lg:pt-16'>
        <div className='flex flex-col items-center space-y-6 lg:flex-1 lg:justify-center'>
          <Badge
            variant='glassmorphic'
            className={cn(heroEnterClassName, 'px-4 py-2 delay-0')}
          >
            <span className='mr-2 size-2 rounded-full bg-linear-to-r from-primary to-accent' />
            Learning plans that land on your calendar
          </Badge>

          <h1
            id={headingId}
            className={cn(
              'marketing-h1 max-w-4xl text-foreground',
              heroEnterClassName,
              'delay-150',
            )}
          >
            Turn goals into a{' '}
            <span className='gradient-text'>scheduled plan</span>
          </h1>

          <p
            className={cn(
              'marketing-subtitle max-w-lg md:max-w-2xl',
              heroEnterClassName,
              'delay-300',
            )}
          >
            Atlaris builds module-by-module roadmaps, attaches resources to each
            session, and syncs your study blocks to Google Calendar.
          </p>

          <div className={cn(heroEnterClassName, 'delay-500')}>
            <Button
              asChild
              variant='default'
              className={marketingPrimaryCtaClassName}
            >
              <Link href='/plans/new'>
                Get started free
                <ArrowRight className='ml-2 size-4 transition-transform group-hover:translate-x-1' />
              </Link>
            </Button>
          </div>
        </div>

        <div
          className={cn(
            'relative mt-12 -mb-32 w-full max-w-7xl md:mt-6 md:-mb-40 lg:mt-0 lg:-mb-48',
            heroEnterClassName,
            'delay-700',
          )}
        >
          <div className='absolute -inset-4 rounded-3xl bg-linear-to-r from-primary/30 to-accent/30 blur-xl' />

          <div className='relative rounded-3xl border border-white/40 bg-white/30 p-2 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-card/30'>
            <div className='rounded-2xl bg-linear-to-br from-white/80 to-white/40 p-6 dark:from-card/60 dark:to-card/40'>
              <div className='rounded-xl border border-border/60 bg-card p-5 shadow-sm'>
                <div className='mb-4 flex items-center justify-between gap-3'>
                  <div className='text-left'>
                    <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
                      Active plan
                    </p>
                    <p className='text-lg font-semibold text-foreground'>
                      TypeScript Fundamentals
                    </p>
                  </div>
                  <span className='rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary'>
                    42% complete
                  </span>
                </div>

                <div className='space-y-3'>
                  {[
                    { title: 'Types & Interfaces', done: true },
                    { title: 'Generics in Practice', done: false },
                    { title: 'Utility Types', done: false },
                  ].map((module) => (
                    <div
                      key={module.title}
                      className='flex items-center gap-3 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-left'
                    >
                      <CheckCircle2
                        className={
                          module.done
                            ? 'size-4 text-success'
                            : 'size-4 text-muted-foreground'
                        }
                        aria-hidden='true'
                      />
                      <span className='text-sm text-foreground'>
                        {module.title}
                      </span>
                    </div>
                  ))}
                </div>

                <div className='mt-4 flex flex-wrap items-center gap-3 text-left text-xs text-muted-foreground'>
                  <span className='inline-flex items-center gap-1.5'>
                    <BookOpen className='size-3.5' aria-hidden='true' />3
                    resources per lesson
                  </span>
                  <span className='inline-flex items-center gap-1.5'>
                    <Calendar className='size-3.5' aria-hidden='true' />
                    Synced to Google Calendar
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
