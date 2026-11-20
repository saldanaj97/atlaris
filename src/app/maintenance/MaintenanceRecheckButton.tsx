'use client';

import { Button } from '@/components/ui/button';

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
