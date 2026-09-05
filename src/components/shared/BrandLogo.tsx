import { ROUTES } from '@/features/navigation';
import Link from 'next/link';

interface BrandLogoProps {
  /** Size variant for responsive display */
  size?: 'sm' | 'md';
  /** Optional click handler (e.g., to close mobile menu) */
  onClick?: () => void;
}

/**
 * Shared brand logo component used across desktop and mobile headers.
 * Wordmark uses display face (Sora via `font-serif`); chrome stays on product tokens.
 * Always links to the marketing landing page — `/` redirects signed-in users to dashboard.
 */
export default function BrandLogo({ size = 'md', onClick }: BrandLogoProps) {
  const isSmall = size === 'sm';

  return (
    <Link
      href={ROUTES.LANDING}
      onClick={onClick}
      className='flex items-center'
      aria-label='Atlaris - Go to homepage'
    >
      <span
        className={`font-serif font-bold tracking-tight text-foreground ${isSmall ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl'}`}
      >
        Atlaris
        <span aria-hidden='true' className='text-primary'>
          .
        </span>
      </span>
    </Link>
  );
}
