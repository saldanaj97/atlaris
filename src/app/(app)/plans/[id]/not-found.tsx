import { Button } from '@/components/ui/button';
import { RouteEmptyState } from '@/components/ui/route-empty-state';
import { ROUTES } from '@/features/navigation/routes';
import { FileQuestion } from 'lucide-react';
import Link from 'next/link';

/**
 * Rendered when a plan is missing or not accessible to the viewer. The copy
 * stays neutral so it does not confirm that another user's plan exists.
 */
export default function PlanNotFound() {
  return (
    <div className='mx-auto max-w-2xl py-10'>
      <RouteEmptyState
        icon={FileQuestion}
        title='Plan not found'
        description="This plan doesn't exist or you don't have access to it."
        action={
          <Button asChild>
            <Link href={ROUTES.PLANS.ROOT}>Back to plans</Link>
          </Button>
        }
      />
    </div>
  );
}
