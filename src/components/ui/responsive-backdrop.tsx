import type { ImageProps } from 'next/image';

import { cn } from '@/lib/utils';
import Image from 'next/image';

export type ResponsiveBackdropSource = {
  src: ImageProps['src'];
  objectPosition?: string;
  className?: string;
};

export interface ResponsiveBackdropProps {
  desktop: ResponsiveBackdropSource;
  mobile: ResponsiveBackdropSource;
  overlay?: 'panel' | 'background';
  sizes?: ImageProps['sizes'];
  className?: string;
}

const overlayClassNames: Record<
  NonNullable<ResponsiveBackdropProps['overlay']>,
  string
> = {
  panel: 'bg-linear-to-r from-panel via-panel/90 to-panel/20',
  background:
    'bg-linear-to-r from-background via-background/90 to-background/15',
};

/** Decorative responsive artwork for a caller-sized, text-bearing surface. */
export function ResponsiveBackdrop({
  desktop,
  mobile,
  overlay = 'panel',
  sizes = '100vw',
  className,
}: ResponsiveBackdropProps) {
  return (
    <div
      data-slot='responsive-backdrop'
      aria-hidden='true'
      className={cn(
        'pointer-events-none absolute inset-0 hidden dark:block',
        className,
      )}
    >
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
          className='absolute inset-0 size-full object-cover'
          style={
            desktop.objectPosition
              ? { objectPosition: desktop.objectPosition }
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
          className='absolute inset-0 size-full object-cover'
          style={
            mobile.objectPosition
              ? { objectPosition: mobile.objectPosition }
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
