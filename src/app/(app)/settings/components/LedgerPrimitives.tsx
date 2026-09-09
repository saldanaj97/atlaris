import type { ReactElement, ReactNode } from 'react';

import { APP_SHELL_SCROLL_MARGIN } from '@/components/layout/app-shell-width';
import { cn } from '@/lib/utils';

const ledgerDivider = 'divide-border/40 dark:divide-border/30';

export function SettingsLedgerShell({
  nav,
  children,
}: {
  nav: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <div className='grid min-w-0 gap-[24px] lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-[32px]'>
      <div className='min-w-0 border-b border-border pb-[16px] lg:border-r lg:border-b-0 lg:pr-[16px] lg:pb-0'>
        {nav}
      </div>
      <div aria-labelledby='settings-content-heading' className='min-w-0'>
        {children}
      </div>
    </div>
  );
}

export function SettingsLedgerPanel({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return <div className='mt-[24px] min-w-0 space-y-[24px]'>{children}</div>;
}

export function LedgerSectionBlock({
  id,
  label,
  description,
  divided = false,
  showTitle = true,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  divided?: boolean;
  showTitle?: boolean;
  children: ReactNode;
}): ReactElement {
  const hasHeader = showTitle || Boolean(description);

  return (
    <section
      id={id}
      aria-label={showTitle ? undefined : label}
      className={cn(
        APP_SHELL_SCROLL_MARGIN,
        'rounded-xl border border-panel-border bg-panel-muted/50 p-5 text-panel-foreground sm:p-6',
      )}
    >
      <div className='min-w-0'>
        {showTitle ? (
          <h2 className='font-heading text-lg tracking-[-0.02em]'>{label}</h2>
        ) : null}
        {description ? (
          <p className='mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground'>
            {description}
          </p>
        ) : null}
        <div
          className={cn(
            'min-w-0',
            hasHeader && 'mt-5',
            divided && ['divide-y', ledgerDivider],
          )}
        >
          {children}
        </div>
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
