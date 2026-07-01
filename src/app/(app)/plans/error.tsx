'use client';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { RouteErrorState } from '@/components/ui/route-error-state';
import { clientLogger } from '@/lib/logging/client';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route-level error boundary for plans list page.
 * Catches unexpected runtime errors and provides a recovery option.
 */
export default function PlansError({ error, reset }: ErrorProps) {
  useEffect(() => {
    clientLogger.error('Plans list error:', {
      errorDigest: error.digest,
      message: error.message,
      stack: error.stack,
    });
  }, [error]);

  return (
    <>
      <PageHeader
        title='Your Plans'
        subtitle='Search, filter, and compare your learning plan library.'
        actions={
          <div className='flex items-center gap-2 sm:pt-8'>
            <Button asChild>
              <Link href='/plans/new'>
                <Plus />
                New Plan
              </Link>
            </Button>
          </div>
        }
      />

      <RouteErrorState
        className='border-destructive/20 bg-destructive/5'
        title='Error Loading Plans'
        message="We couldn't load your learning plans. This could be a temporary issue."
        onRetry={reset}
      />
    </>
  );
}
