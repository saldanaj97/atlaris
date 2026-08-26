import { Button } from '@/components/ui/button';
import { RouteErrorState } from '@/components/ui/route-error-state';
import Link from 'next/link';

interface PlanDetailPageErrorProps {
  message?: string;
  upgradeHref?: string;
}

/**
 * Renders a centered error UI for the plan detail page.
 */
export function PlanDetailPageError({
  message,
  upgradeHref,
}: PlanDetailPageErrorProps) {
  return (
    <div className='mx-auto max-w-2xl py-10'>
      <RouteErrorState
        title='Error loading plan'
        message={
          message ??
          'There was an error loading the learning plan. Please try again later.'
        }
        actions={
          <div className='flex flex-wrap justify-center gap-3'>
            {upgradeHref ? (
              <Button asChild>
                <Link href={upgradeHref}>Upgrade</Link>
              </Button>
            ) : null}
            <Button asChild variant={upgradeHref ? 'outline' : 'default'}>
              <Link href='/plans'>Back to plans</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
