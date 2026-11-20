import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { HorizonArc } from '@/components/ui/horizon-arc';
import { cn } from '@/lib/utils';

export interface CtaBannerProps extends ComponentPropsWithoutRef<'section'> {
  children: ReactNode;
  horizon?: boolean;
}

export function CtaBanner({
  children,
  className,
  horizon = true,
  ...props
}: CtaBannerProps) {
  return (
    <section
      data-slot='cta-banner'
      className={cn(
        'relative isolate overflow-hidden rounded-[12px] border border-border bg-panel shadow-sm',
        className,
      )}
      {...props}
    >
      {horizon ? <HorizonArc /> : null}
      {children}
    </section>
  );
}
