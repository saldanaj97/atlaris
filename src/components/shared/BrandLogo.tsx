import type { CSSProperties } from 'react';

import { ROUTES } from '@/features/navigation';
import {
  type BrandLockupVariant,
  type BrandLogoSize,
  BRAND_LOCKUPS,
  getBrandLockupLayout,
} from '@/shared/constants/brand-assets';
import Image from 'next/image';
import Link from 'next/link';

interface BrandLogoProps {
  /** Size variant for responsive display */
  size?: BrandLogoSize;
  /** Optional click handler (e.g., to close mobile menu) */
  onClick?: () => void;
  /**
   * When false, render the lockup without a destination.
   * Maintenance must not link home while that route redirects back here.
   */
  linked?: boolean;
}

function LockupImage({
  variant,
  size,
}: {
  variant: BrandLockupVariant;
  size: BrandLogoSize;
}) {
  const lockup = BRAND_LOCKUPS[variant];
  const { width, height, imageWidth, imageHeight, offsetX, offsetY } =
    getBrandLockupLayout(variant, size);

  return (
    <span
      className={
        variant === 'light'
          ? 'relative block h-(--lockup-height) w-(--lockup-width) overflow-hidden dark:hidden'
          : 'relative hidden h-(--lockup-height) w-(--lockup-width) overflow-hidden dark:block'
      }
      style={
        {
          '--lockup-width': `${width}px`,
          '--lockup-height': `${height}px`,
        } as CSSProperties
      }
    >
      <Image
        src={lockup.src}
        alt=''
        aria-hidden='true'
        width={lockup.canvasWidth}
        height={lockup.canvasHeight}
        sizes={`${imageWidth}px`}
        className='absolute top-(--lockup-offset-y) left-(--lockup-offset-x) h-(--lockup-image-height) w-(--lockup-image-width) max-w-none'
        style={
          {
            '--lockup-image-width': `${imageWidth}px`,
            '--lockup-image-height': `${imageHeight}px`,
            '--lockup-offset-x': `${offsetX}px`,
            '--lockup-offset-y': `${offsetY}px`,
          } as CSSProperties
        }
      />
    </span>
  );
}

/**
 * Shared brand logo used in chrome. Linked lockups go to `/landing`
 * because `/` sends signed-in users to dashboard. Unlinked lockups
 * keep the same visible crop without a destination.
 */
export default function BrandLogo({
  size = 'md',
  onClick,
  linked = true,
}: BrandLogoProps) {
  const lockups = (
    <>
      <LockupImage variant='light' size={size} />
      <LockupImage variant='dark' size={size} />
    </>
  );

  if (!linked) {
    return (
      <span
        className='inline-flex min-h-11 shrink-0 items-center px-1'
        aria-label='Atlaris'
      >
        {lockups}
      </span>
    );
  }

  return (
    <Link
      href={ROUTES.LANDING}
      onClick={onClick}
      className='inline-flex min-h-11 shrink-0 items-center px-1'
      aria-label='Atlaris - Go to homepage'
    >
      {lockups}
    </Link>
  );
}
