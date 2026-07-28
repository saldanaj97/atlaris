import { cn } from '@/lib/utils';
import * as React from 'react';

/**
 * Stat / KPI tile for product surfaces; uses panel tokens instead of raw stone/slate.
 */
function MetricCard({
  className,
  icon,
  label,
  value,
  sublabel,
  ...props
}: React.ComponentProps<'div'> & {
  icon?: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
}) {
  return (
    <div
      data-slot='metric-card'
      className={cn(
        'rounded-2xl border border-panel-border bg-panel p-4 shadow-sm transition-[box-shadow,border-color] hover:border-primary/25 hover:shadow-md',
        className,
      )}
      {...props}
    >
      <div className='mb-3 flex items-center gap-2 text-muted-foreground'>
        {icon ? (
          <span className='text-primary [&>svg]:size-5'>{icon}</span>
        ) : null}
        <span className='text-xs font-medium tracking-wide uppercase'>
          {label}
        </span>
      </div>
      <div className='text-2xl font-semibold text-foreground tabular-nums'>
        {value}
      </div>
      {sublabel ? (
        <div className='text-xs text-muted-foreground'>{sublabel}</div>
      ) : null}
    </div>
  );
}

export { MetricCard };
