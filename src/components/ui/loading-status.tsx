import type { ReactNode } from 'react';

/** Stable, screen-reader-only status line that names what a skeleton is loading (§18.3). */
function LoadingStatus({ children }: { children: ReactNode }) {
  return (
    <output data-slot='loading-status' className='sr-only'>
      {children}
    </output>
  );
}

export { LoadingStatus };
