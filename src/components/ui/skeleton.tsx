import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot='skeleton'
      aria-hidden='true'
      className={cn(
        'animate-pulse rounded-md bg-secondary motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
