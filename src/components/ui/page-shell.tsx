import {
  APP_SHELL_COLUMN,
  APP_SHELL_CONTENT_INSET,
  APP_SHELL_GUTTER,
} from '@/components/layout/app-shell-width';
import { cn } from '@/lib/utils';
import * as React from 'react';

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
      data-slot='page-shell'
      className={cn(
        APP_SHELL_GUTTER,
        fullHeight && 'min-h-[calc(100vh-4rem)]',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          APP_SHELL_COLUMN,
          APP_SHELL_CONTENT_INSET,
          'py-5 sm:py-6',
        )}
      >
        {children}
      </div>
    </div>
  );
}

export { PageShell };
