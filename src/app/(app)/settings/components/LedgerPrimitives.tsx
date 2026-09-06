import type { ReactElement, ReactNode } from 'react';

import { cn } from '@/lib/utils';

const ledgerDivider = 'divide-border/40 dark:divide-border/30';

export function SettingsLedgerPanel({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return <div className='min-w-0 space-y-4'>{children}</div>;
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
}): ReactElement {
  return (
    <section
      id={id}
      className='scroll-mt-24 rounded-[12px] border border-panel-border bg-panel p-5 text-panel-foreground shadow-sm sm:p-6'
    >
      <div className='grid min-w-0 gap-4 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-8'>
        <div className='md:pt-1'>
          <h2 className='font-heading text-lg tracking-[-0.02em]'>{label}</h2>
          <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>
            {description}
          </p>
        </div>
        <div className={cn('min-w-0 divide-y', ledgerDivider)}>{children}</div>
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
}): ReactElement {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-2 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
        className,
      )}
    >
      <div className='min-w-0'>
        <p className='text-sm text-foreground'>{label}</p>
        {hint ? (
          <p className='mt-0.5 text-xs text-muted-foreground'>{hint}</p>
        ) : null}
      </div>
      <div className='flex max-w-full min-w-0 flex-wrap items-center gap-2 text-sm [overflow-wrap:anywhere] text-muted-foreground sm:justify-end sm:text-right'>
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
}): ReactElement {
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
