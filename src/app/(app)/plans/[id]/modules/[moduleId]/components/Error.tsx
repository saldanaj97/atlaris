import { Button } from '@/components/ui/button';
import { RouteErrorState } from '@/components/ui/route-error-state';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface ModuleDetailPageErrorProps {
  message?: string;
  planId?: string;
}

/**
 * Renders a full-screen error UI for the module detail page.
 */
export function ModuleDetailPageError({
  message,
  planId,
}: ModuleDetailPageErrorProps) {
  return (
    <div
      role='alert'
      className='flex min-h-[60vh] flex-col items-center justify-center p-4'
    >
      <RouteErrorState
        title='Error Loading Module'
        message={
          message ??
          'There was an error loading the module. Please try again later.'
        }
        actions={
          <div className='flex flex-col gap-3 sm:flex-row sm:justify-center'>
            {planId ? (
              <Button asChild>
                <Link href={`/plans/${planId}`}>
                  <ArrowLeft />
                  Back to Plan
                </Link>
              </Button>
            ) : null}
            <Button asChild variant='outline'>
              <Link href='/plans'>View All Plans</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
