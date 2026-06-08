import { BookOpen, Calendar, CheckCircle2 } from 'lucide-react';

/**
 * Product mock shown below the landing hero headline.
 */
export function LandingHeroVisual() {
  return (
    <div aria-hidden='true'>
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
                <BookOpen className='size-3.5' aria-hidden='true' />3 resources
                per lesson
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
  );
}
