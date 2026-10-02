'use client';

import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

/** Re-runs the server read behind the profile plan card. */
export function PlanCardRetryButton() {
  const router = useRouter();

  return (
    <Button variant='outline' size='sm' onClick={() => router.refresh()}>
      Try again
    </Button>
  );
}
