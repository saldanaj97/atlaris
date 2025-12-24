'use client';

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
  const iconSize = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  const iconInnerSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const iconRounding = size === 'sm' ? 'rounded-lg' : 'rounded-xl';
  const textSize = size === 'sm' ? 'text-lg' : 'text-xl';

  return (
    <Link
      href="/"
      onClick={onClick}
      className="flex items-center space-x-2"
      aria-label="Atlaris - Go to homepage"
    >
      <div
        className={`flex ${iconSize} items-center justify-center ${iconRounding} bg-gradient-to-br from-purple-400 to-pink-400 text-white shadow-lg`}
      >
        <svg
          className={iconInnerSize}
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
        className={`bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text ${textSize} font-semibold text-transparent`}
      >
        Atlaris
      </span>
    </Link>
  );
}
