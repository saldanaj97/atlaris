import Link from 'next/link';

interface BrandLogoProps {
  /** Size variant for responsive display */
  size?: 'sm' | 'md';
  /** Optional click handler (e.g., to close mobile menu) */
  onClick?: () => void;
}

/**
 * Shared brand logo component used across desktop and mobile headers.
 * Consolidates the logo mark + gradient text to ensure consistency.
 */
export default function BrandLogo({ size = 'md', onClick }: BrandLogoProps) {
  const isSmall = size === 'sm';

  return (
    <Link
      href="/"
      onClick={onClick}
      className="flex items-center space-x-2"
      aria-label="Atlaris - Go to homepage"
    >
      <div
        className={`from-primary to-accent bg-primary flex items-center justify-center bg-gradient-to-br text-white shadow-lg ${
          isSmall ? 'h-8 w-8 rounded-lg' : 'h-9 w-9 rounded-xl'
        }`}
      >
        <svg
          className={isSmall ? 'h-4 w-4' : 'h-5 w-5'}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      </div>
      <span
        className={`from-primary to-accent bg-gradient-to-r bg-clip-text font-semibold text-transparent ${
          isSmall ? 'text-lg' : 'text-xl'
        }`}
      >
        Atlaris
      </span>
    </Link>
  );
}
