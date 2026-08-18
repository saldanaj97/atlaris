import type { ReactElement, ReactNode } from 'react';

import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/utils';

const ledgerDivider = 'divide-border/40 dark:divide-border/30';

export function SettingsLedgerPanel({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <div className='mx-auto max-w-4xl'>
      <Surface padding='none' className={cn('divide-y', ledgerDivider)}>
        {children}
      </Surface>
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
}): ReactElement {
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
      <div className={cn('min-w-0 divide-y', ledgerDivider)}>{children}</div>
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
        'flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
        className,
      )}
    >
      <div className='min-w-0'>
        <p className='text-sm text-foreground'>{label}</p>
        {hint ? (
          <p className='mt-0.5 text-xs text-muted-foreground'>{hint}</p>
        ) : null}
      </div>
      <div className='flex min-w-0 flex-wrap items-center gap-2 text-sm [overflow-wrap:anywhere] text-muted-foreground sm:justify-end sm:text-right'>
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
