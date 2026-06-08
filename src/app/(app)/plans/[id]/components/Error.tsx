import { Button } from '@/components/ui/button';
import { RouteErrorState } from '@/components/ui/route-error-state';
import Link from 'next/link';

interface PlanDetailPageErrorProps {
  message?: string;
}

/**
 * Renders a centered error UI for the plan detail page.
 */
export function PlanDetailPageError({ message }: PlanDetailPageErrorProps) {
  return (
    <div className='mx-auto max-w-2xl py-10'>
      <RouteErrorState
        title='Error loading plan'
        message={
          message ??
          'There was an error loading the learning plan. Please try again later.'
        }
        actions={
          <Button asChild>
            <Link href='/plans'>Back to plans</Link>
          </Button>
        }
      />
    </div>
  );
}
