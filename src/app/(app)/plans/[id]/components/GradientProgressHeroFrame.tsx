import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface GradientProgressHeroFrameProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  completion: number;
}

/** Product panel frame for plan/module hero headers with a bottom progress track. */
export function GradientProgressHeroFrame({
  children,
  className,
  contentClassName,
  completion,
}: GradientProgressHeroFrameProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-panel-border bg-panel p-6 shadow-sm sm:p-7',
        className,
      )}
    >
      <div
        className={cn(
          'relative flex flex-col justify-between',
          contentClassName,
        )}
      >
        {children}
      </div>

      <div
        className='absolute right-0 bottom-0 left-0 h-1 bg-muted'
        aria-hidden
      >
        <div
          className='h-full bg-primary transition-[width] duration-500 motion-reduce:transition-none'
          style={{ width: `${completion}%` }}
        />
      </div>
    </div>
  );
}
