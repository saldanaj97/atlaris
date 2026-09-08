import type { ReactNode } from 'react';

/** Quiet section divider used between marketing page blocks. */
export function Hairline(): ReactNode {
  return <div className='h-px w-full bg-border/35' aria-hidden='true' />;
}
