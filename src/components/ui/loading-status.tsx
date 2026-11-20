import type { ReactNode } from 'react';

function LoadingStatus({ children }: { children: ReactNode }) {
  return (
    <output data-slot='loading-status' className='sr-only'>
      {children}
    </output>
  );
}

export { LoadingStatus };
