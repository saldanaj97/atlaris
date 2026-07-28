import { cn } from '@/lib/utils';

export function StatCell({
  label,
  value,
  sublabel,
  className,
  truncate = false,
}: {
  label: string;
  value: string;
  sublabel: string;
  className?: string;
  truncate?: boolean;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className='text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase'>
        {label}
      </dt>
      <dd className='mt-1'>
        <span
          className={cn(
            'block text-lg font-semibold text-foreground tabular-nums',
            truncate && 'truncate',
          )}
        >
          {value}
        </span>
        <span
          className={cn(
            'mt-0.5 block text-xs text-muted-foreground',
            truncate && 'truncate',
          )}
        >
          {sublabel}
        </span>
      </dd>
    </div>
  );
}
