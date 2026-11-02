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
        // The divider border: the panel border is about 1.1:1 on the dark canvas,
        // so the card would have no visible edge.
        'relative isolate overflow-hidden rounded-[12px] border border-border bg-panel shadow-sm',
        className,
      )}
      {...props}
    >
      <HorizonArc />
      {children}
    </section>
  );
}
