import type { ImageProps } from 'next/image';
import type { CSSProperties } from 'react';

import { cn } from '@/lib/utils';
import Image, { getImageProps } from 'next/image';

export type ResponsiveBackdropSource = {
  src: ImageProps['src'];
  objectPosition?: string;
  className?: string;
};

export interface ResponsiveBackdropProps {
  desktop: ResponsiveBackdropSource;
  mobile: ResponsiveBackdropSource;
  overlay?: 'panel' | 'background' | 'vignette';
  sizes?: ImageProps['sizes'];
  className?: string;
  slot?: string;
  /** Opt in for above-the-fold LCP artwork only. Other callers stay lazy. */
  priority?: boolean;
}

const overlayClassNames: Record<
  NonNullable<ResponsiveBackdropProps['overlay']>,
  string
> = {
  panel: 'bg-linear-to-r from-panel via-panel/90 to-panel/20',
  background:
    'bg-linear-to-r from-background via-background/90 to-background/15',
  vignette:
    'bg-linear-to-b from-background/70 via-background/25 to-background/65',
};

const DESKTOP_MEDIA = '(min-width: 768px)';
const MOBILE_MEDIA = '(max-width: 767px)';

function backdropImageProps(
  src: ImageProps['src'],
  sizes: ImageProps['sizes'],
) {
  return getImageProps({
    src,
    alt: '',
    fill: true,
    sizes,
  }).props;
}

/** Emits one viewport-scoped preload so desktop and mobile stills do not compete. */
function BackdropPriorityPreloads({
  desktopSrc,
  mobileSrc,
  sizes,
}: {
  desktopSrc: ImageProps['src'];
  mobileSrc: ImageProps['src'];
  sizes: ImageProps['sizes'];
}) {
  const desktop = backdropImageProps(desktopSrc, sizes);
  const mobile = backdropImageProps(mobileSrc, sizes);

  return (
    <>
      <link
        rel='preload'
        as='image'
        imageSrcSet={desktop.srcSet}
        imageSizes={desktop.sizes}
        media={DESKTOP_MEDIA}
      />
      <link
        rel='preload'
        as='image'
        imageSrcSet={mobile.srcSet}
        imageSizes={mobile.sizes}
        media={MOBILE_MEDIA}
      />
    </>
  );
}

/** Decorative responsive artwork for a caller-sized, text-bearing surface. */
export function ResponsiveBackdrop({
  desktop,
  mobile,
  overlay = 'panel',
  sizes = '100vw',
  className,
  slot = 'responsive-backdrop',
  priority = false,
}: ResponsiveBackdropProps) {
  return (
    <div
      data-slot={slot}
      aria-hidden='true'
      className={cn(
        'pointer-events-none absolute inset-0 hidden dark:block',
        className,
      )}
    >
      {priority ? (
        <BackdropPriorityPreloads
          desktopSrc={desktop.src}
          mobileSrc={mobile.src}
          sizes={sizes}
        />
      ) : null}
      <div
        className={cn(
          'absolute inset-0 left-auto w-full hidden md:block',
          desktop.className,
        )}
      >
        <Image
          src={desktop.src}
          alt=''
          fill
          sizes={sizes}
          className='absolute inset-0 size-full object-cover object-(--backdrop-position)'
          style={
            desktop.objectPosition
              ? ({
                  '--backdrop-position': desktop.objectPosition,
                } as CSSProperties)
              : undefined
          }
        />
      </div>
      <div
        className={cn(
          'absolute inset-0 left-auto w-full md:hidden',
          mobile.className,
        )}
      >
        <Image
          src={mobile.src}
          alt=''
          fill
          sizes={sizes}
          className='absolute inset-0 size-full object-cover object-(--backdrop-position)'
          style={
            mobile.objectPosition
              ? ({
                  '--backdrop-position': mobile.objectPosition,
                } as CSSProperties)
              : undefined
          }
        />
      </div>
      <div
        aria-hidden='true'
        className={cn('absolute inset-0', overlayClassNames[overlay])}
      />
    </div>
  );
}
