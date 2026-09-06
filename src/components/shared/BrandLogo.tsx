import { ROUTES } from '@/features/navigation';
import Image from 'next/image';
import Link from 'next/link';

interface BrandLogoProps {
  /** Size variant for responsive display */
  size?: 'sm' | 'md';
  /** Optional click handler (e.g., to close mobile menu) */
  onClick?: () => void;
}

/**
 * Shared brand logo component used across desktop and mobile headers.
 * Uses the supplied lockup exports so the mark and wordmark stay in sync.
 * Always links to the marketing landing page — `/` redirects signed-in users to dashboard.
 */
export default function BrandLogo({ size = 'md', onClick }: BrandLogoProps) {
  const isSmall = size === 'sm';
  const lightLogoSize = isSmall ? 'h-6 sm:h-7' : 'h-8 sm:h-9';
  const darkLogoSize = isSmall ? 'h-10 sm:h-12' : 'h-14 sm:h-16';

  return (
    <Link
      href={ROUTES.LANDING}
      onClick={onClick}
      className='flex items-center'
      aria-label='Atlaris - Go to homepage'
    >
      <Image
        src='/brand/logo-on-light.png'
        alt=''
        aria-hidden='true'
        width={2172}
        height={724}
        className={`${lightLogoSize} w-auto dark:hidden`}
      />
      <Image
        src='/brand/logo-on-dark.png'
        alt=''
        aria-hidden='true'
        width={2172}
        height={724}
        className={`hidden w-auto ${darkLogoSize} dark:block`}
      />
    </Link>
  );
}
