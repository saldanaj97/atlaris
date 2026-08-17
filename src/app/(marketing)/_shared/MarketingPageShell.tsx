import type { ReactNode } from 'react';

import {
  APP_SHELL_HEADER_TUCK,
  APP_SHELL_MAIN_OFFSET,
} from '@/components/layout/app-shell-width';

interface MarketingPageShellProps {
  children: ReactNode;
}

/**
 * Canonical marketing page background and width contract.
 * Tucks under the fixed header so `absolute inset-0` backdrops reach the
 * viewport top; padding keeps in-flow content below the header.
 */
export function MarketingPageShell({
  children,
}: MarketingPageShellProps): ReactNode {
  return (
    <div
      className={`relative ${APP_SHELL_HEADER_TUCK} min-h-screen w-full overflow-hidden bg-background ${APP_SHELL_MAIN_OFFSET} font-sans text-foreground`}
    >
      {children}
    </div>
  );
}
