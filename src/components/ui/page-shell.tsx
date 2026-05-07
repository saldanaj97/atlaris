import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Product app page outer wrapper: 64px header-aware height, max width,
 * horizontal padding, and product vertical rhythm.
 */
function PageShell({
  className,
  fullHeight = true,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  /** When true, ensures at least viewport height (typical app pages). */
  fullHeight?: boolean;
}) {
  return (
    <div
      data-slot="page-shell"
      className={cn(
        'mx-auto max-w-7xl px-4 py-6 sm:px-6 md:py-7',
        fullHeight && 'min-h-[calc(100vh-4rem)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { PageShell };
