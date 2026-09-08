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
          ? 'relative block overflow-hidden dark:hidden'
          : 'relative hidden overflow-hidden dark:block'
      }
      style={{ width, height }}
    >
      <Image
        src={lockup.src}
        alt=''
        aria-hidden='true'
        width={lockup.canvasWidth}
        height={lockup.canvasHeight}
        sizes={`${imageWidth}px`}
        className='absolute max-w-none'
        style={{
          width: imageWidth,
          height: imageHeight,
          left: offsetX,
          top: offsetY,
        }}
      />
    </span>
  );
}

/**
 * Shared brand logo component used across desktop and mobile headers.
 * Uses the supplied lockup exports so the mark and wordmark stay in sync.
 * Always links to the marketing landing page — `/` redirects signed-in users to dashboard.
 */
export default function BrandLogo({ size = 'md', onClick }: BrandLogoProps) {
  return (
    <Link
      href={ROUTES.LANDING}
      onClick={onClick}
      className='inline-flex min-h-11 shrink-0 items-center'
      aria-label='Atlaris - Go to homepage'
    >
      <LockupImage variant='light' size={size} />
      <LockupImage variant='dark' size={size} />
    </Link>
  );
}
