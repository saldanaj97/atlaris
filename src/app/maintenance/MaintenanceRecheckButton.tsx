'use client';

import { Button } from '@/components/ui/button';

/** Reloads the current document so the maintenance guard can re-evaluate. */
export function MaintenanceRecheckButton() {
  return (
    <Button
      type='button'
      className='mt-8 min-h-11 px-6'
      onClick={() => {
        window.location.reload();
      }}
    >
      Try again
    </Button>
  );
}
