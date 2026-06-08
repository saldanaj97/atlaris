'use client';

import type { JSX } from 'react';

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
export default function PlansError({ error, reset }: ErrorProps): JSX.Element {
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
        actions={
          <Button asChild>
            <Link href='/plans/new'>
              <Plus />
              New Plan
            </Link>
          </Button>
        }
      />

      <RouteErrorState
        title='Error Loading Plans'
        message="We couldn't load your learning plans. This could be a temporary issue."
        onRetry={reset}
      />
    </>
  );
}
