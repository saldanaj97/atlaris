import type { JSX, ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface MarketingPageShellProps {
  children: ReactNode;
  /** Offset fixed marketing header (`SiteHeader`); use on landing. */
  withHeaderOffset?: boolean;
  className?: string;
}

/**
 * Canonical marketing page background and width contract.
 */
export function MarketingPageShell({
  children,
  withHeaderOffset = false,
  className,
}: MarketingPageShellProps): JSX.Element {
  return (
    <div
      className={cn(
        'relative min-h-screen w-full overflow-hidden bg-linear-to-br from-primary/5 via-accent/5 to-background font-sans text-foreground',
        withHeaderOffset && '-mt-16 pt-16',
        className,
      )}
    >
      <div className='relative'>{children}</div>
    </div>
  );
}
