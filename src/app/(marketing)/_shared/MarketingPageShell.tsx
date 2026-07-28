import type { ReactNode } from 'react';

interface MarketingPageShellProps {
  children: ReactNode;
}

/**
 * Canonical marketing page background and width contract.
 */
export function MarketingPageShell({
  children,
}: MarketingPageShellProps): ReactNode {
  return (
    <div className='relative -mt-16 min-h-screen w-full overflow-hidden bg-background pt-16 font-sans text-foreground'>
      <div className='relative z-0'>{children}</div>
    </div>
  );
}
