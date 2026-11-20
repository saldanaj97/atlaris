import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface SectionOverlineProps extends ComponentPropsWithoutRef<'p'> {
  children: ReactNode;
  icon?: ReactNode;
}

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
        'flex items-center gap-2 type-eyebrow text-primary',
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </p>
  );
}
