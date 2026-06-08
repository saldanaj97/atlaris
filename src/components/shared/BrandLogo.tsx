import Link from 'next/link';

interface BrandLogoProps {
  /** Size variant for responsive display */
  size?: 'sm' | 'md';
  /** Optional click handler (e.g., to close mobile menu) */
  onClick?: () => void;
  /** Use solid brand color instead of gradient (avoids theme hydration mismatch in chrome). */
  variant?: 'gradient' | 'solid';
}

/**
 * Shared brand logo component used across desktop and mobile headers.
 * Typography-only branding for consistent display.
 */
export default function BrandLogo({
  size = 'md',
  onClick,
  variant = 'solid',
}: BrandLogoProps) {
  const isSmall = size === 'sm';

  return (
    <Link
      href='/'
      onClick={onClick}
      className='flex items-center'
      aria-label='Atlaris - Go to homepage'
    >
      <span
        className={`font-semibold ${
          variant === 'gradient'
            ? 'gradient-text'
            : 'text-primary dark:text-primary'
        } ${isSmall ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl'}`}
      >
        Atlaris
      </span>
    </Link>
  );
}
