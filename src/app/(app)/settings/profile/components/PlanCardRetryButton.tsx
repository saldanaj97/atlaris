'use client';

import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export function PlanCardRetryButton() {
  const router = useRouter();

  return (
    <Button variant='outline' size='sm' onClick={() => router.refresh()}>
      Try again
    </Button>
  );
}
