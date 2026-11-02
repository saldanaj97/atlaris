import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { HorizonArc } from '@/components/ui/horizon-arc';
import { cn } from '@/lib/utils';

export interface CtaBannerProps extends ComponentPropsWithoutRef<'section'> {
  children: ReactNode;
}

/** Bordered CTA surface with the horizon decoration. */
export function CtaBanner({ children, className, ...props }: CtaBannerProps) {
  return (
    <section
      data-slot='cta-banner'
      className={cn(
        'relative isolate overflow-hidden rounded-[12px] border border-panel-border bg-panel shadow-sm',
        className,
      )}
      {...props}
    >
      <HorizonArc />
      {children}
    </section>
  );
}
