import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Frosted surface over the app background — Ledger glass panel tokens. */
export const ledgerGlassSurface =
  'rounded-2xl border border-white/50 bg-white/45 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-card/50';

export const ledgerGlassDivider = 'divide-white/40 dark:divide-white/10';

export function SettingsLedgerAmbient(): React.ReactElement {
  return (
    <div
      aria-hidden='true'
      className='pointer-events-none absolute -top-16 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-linear-to-br from-primary/25 to-primary/5 blur-3xl'
    />
  );
}

export function SettingsLedgerPanel({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  return (
    <div className='relative mx-auto max-w-4xl'>
      <SettingsLedgerAmbient />
      <div
        className={cn(
          'relative divide-y',
          ledgerGlassDivider,
          ledgerGlassSurface,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function LedgerSectionBlock({
  id,
  label,
  description,
  children,
}: {
  id: string;
  label: string;
  description: string;
  children: ReactNode;
}): React.ReactElement {
  return (
    <section
      id={id}
      className='grid scroll-mt-24 gap-4 px-5 py-7 sm:px-7 md:grid-cols-[11.5rem_1fr] md:gap-8'
    >
      <div className='md:sticky md:top-24 md:self-start'>
        <h2 className='text-sm font-semibold tracking-normal'>{label}</h2>
        <p className='mt-1 text-xs leading-relaxed text-muted-foreground'>
          {description}
        </p>
      </div>
      <div className={cn('min-w-0 divide-y', ledgerGlassDivider)}>
        {children}
      </div>
    </section>
  );
}

export function LedgerRow({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}): React.ReactElement {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0',
        className,
      )}
    >
      <div className='min-w-0'>
        <p className='text-sm text-foreground'>{label}</p>
        {hint ? (
          <p className='mt-0.5 text-xs text-muted-foreground'>{hint}</p>
        ) : null}
      </div>
      <div className='flex shrink-0 items-center gap-2 text-sm text-muted-foreground'>
        {children}
      </div>
    </div>
  );
}

export function LedgerStackedRow({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}): React.ReactElement {
  return (
    <div className='py-3.5 first:pt-0 last:pb-0'>
      <div className='mb-1.5 flex items-center justify-between gap-4 text-sm'>
        <div className='min-w-0'>
          <span className='text-foreground'>{label}</span>
          {hint ? (
            <p className='mt-0.5 text-xs text-muted-foreground'>{hint}</p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}
