import type { ReactNode } from 'react';

import { APP_SHELL_MAIN_OFFSET } from '@/components/layout/app-shell-width';

interface MarketingPageShellProps {
  children: ReactNode;
}

/**
 * Canonical marketing page background and in-flow offset below the fixed header.
 * Landing canvas tuck is landing-only — not this shared contract.
 */
export function MarketingPageShell({
  children,
}: MarketingPageShellProps): ReactNode {
  return (
    <div
      className={`relative min-h-screen w-full overflow-hidden bg-background ${APP_SHELL_MAIN_OFFSET} font-sans text-foreground`}
    >
      {children}
    </div>
  );
}
