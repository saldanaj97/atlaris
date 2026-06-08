import { cn } from '@/lib/utils';
import * as React from 'react';

const PAGE_HEADER_SUBTITLE_CLASS =
  'mt-1 text-sm leading-[1.5] tracking-normal text-muted-foreground';

/**
 * Product page title row: centralizes app title/subtitle scale so pages do not improvise typography.
 */
function PageHeader({
  className,
  title,
  subtitle,
  actions,
  titleAs: TitleTag = 'h1',
  align = 'start',
  ...props
}: React.ComponentProps<'div'> & {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Use `h2` for nested pages under a parent title (e.g. settings sub-routes). */
  titleAs?: 'h1' | 'h2';
  align?: 'start' | 'center';
}) {
  const isCentered = align === 'center';

  return (
    <header
      data-slot='page-header'
      className={cn(
        isCentered
          ? 'mb-5 flex flex-col items-center gap-3 text-center'
          : 'mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
      {...props}
    >
      <div className={cn('min-w-0 flex-1', isCentered && 'w-full')}>
        <TitleTag className='text-balance text-foreground'>{title}</TitleTag>
        {subtitle != null ? (
          typeof subtitle === 'string' ? (
            <p className={PAGE_HEADER_SUBTITLE_CLASS}>{subtitle}</p>
          ) : (
            <div className={PAGE_HEADER_SUBTITLE_CLASS}>{subtitle}</div>
          )
        ) : null}
      </div>
      {actions ? (
        <div className='flex shrink-0 flex-wrap items-center gap-2'>
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export { PageHeader };
