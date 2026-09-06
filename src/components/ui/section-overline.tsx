import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface SectionOverlineProps extends ComponentPropsWithoutRef<'p'> {
  children: ReactNode;
  icon?: ReactNode;
}

/** Shared product eyebrow; callers provide any icon or page-specific treatment. */
export function SectionOverline({
  children,
  icon,
  className,
  ...props
}: SectionOverlineProps) {
  return (
    <p
      data-slot='section-overline'
      className={cn(
        'flex items-center gap-2 text-[11px] font-medium tracking-[0.18em] text-primary uppercase',
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </p>
  );
}
