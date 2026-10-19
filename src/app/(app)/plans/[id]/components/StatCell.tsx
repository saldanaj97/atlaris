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
      <dt className='type-eyebrow text-muted-foreground'>{label}</dt>
      <dd className='mt-1'>
        <span
          className={cn(
            'block type-card text-foreground tabular-nums',
            truncate && 'truncate',
          )}
        >
          {value}
        </span>
        <span
          className={cn(
            'mt-0.5 block type-meta text-muted-foreground',
            truncate && 'truncate',
          )}
        >
          {sublabel}
        </span>
      </dd>
    </div>
  );
}
