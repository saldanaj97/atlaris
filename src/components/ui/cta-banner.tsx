import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { ResponsiveBackdrop } from '@/components/ui/responsive-backdrop';
import { cn } from '@/lib/utils';

export type CtaBannerArtwork = 'horizon' | 'mountain';

export interface CtaBannerProps extends ComponentPropsWithoutRef<'section'> {
  artwork: CtaBannerArtwork;
  children: ReactNode;
}

const artworkSources: Record<
  CtaBannerArtwork,
  Parameters<typeof ResponsiveBackdrop>[0]
> = {
  horizon: {
    desktop: {
      src: '/artwork/cta-horizon-desktop.jpg',
      objectPosition: '58% 50%',
    },
    mobile: {
      src: '/artwork/cta-horizon-mobile.jpg',
      objectPosition: '58% 50%',
    },
    overlay: 'background',
  },
  mountain: {
    desktop: {
      src: '/artwork/cta-mountain-desktop.jpg',
      objectPosition: '58% 50%',
    },
    mobile: {
      src: '/artwork/cta-mountain-mobile.jpg',
      objectPosition: '58% 50%',
    },
    overlay: 'background',
  },
};

/** Bordered CTA surface with the two shipped artwork treatments. */
export function CtaBanner({
  artwork,
  children,
  className,
  ...props
}: CtaBannerProps) {
  return (
    <section
      data-slot='cta-banner'
      className={cn(
        'relative isolate overflow-hidden rounded-[12px] border border-panel-border bg-panel shadow-sm',
        className,
      )}
      {...props}
    >
      <ResponsiveBackdrop {...artworkSources[artwork]} />
      {children}
    </section>
  );
}
