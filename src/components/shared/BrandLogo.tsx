import Link from 'next/link';

interface BrandLogoProps {
  /** Size variant for responsive display */
  size?: 'sm' | 'md';
  /** Optional click handler (e.g., to close mobile menu) */
  onClick?: () => void;
}

/**
 * Shared brand logo component used across desktop and mobile headers.
 * Typography-only branding for consistent display.
 */
export default function BrandLogo({ size = 'md', onClick }: BrandLogoProps) {
  const isSmall = size === 'sm';

  return (
    <Link
      href="/"
      onClick={onClick}
      className="flex items-center"
      aria-label="Atlaris - Go to homepage"
    >
      <span
        className={`from-primary to-accent bg-gradient-to-r bg-clip-text font-semibold text-transparent ${
          isSmall ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl'
        }`}
      >
        Atlaris
      </span>
    </Link>
  );
}
