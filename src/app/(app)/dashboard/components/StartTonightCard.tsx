import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ROUTES } from '@/features/navigation/routes';
import Link from 'next/link';

/**
 * Empty-state card when there is no active plan to resume.
 */
export function StartTonightCard({
  canCreatePlan,
}: {
  canCreatePlan?: boolean;
}) {
  return (
    <Card
      as='article'
      className='p-5 animate-dashboard-unfold [--dashboard-entry-x:-0.75rem] motion-reduce:animate-none sm:p-6'
    >
      <h2 className='text-lg font-semibold text-foreground sm:text-xl'>
        Start learning
      </h2>

      <h3 className='mt-4 text-xl font-semibold text-balance text-foreground'>
        Your next plan is waiting
      </h3>

      <p className='mt-2 max-w-xl text-sm text-muted-foreground'>
        Create a learning map and pick up whenever the night is quiet.
      </p>

      <div className='mt-6 flex flex-wrap items-center gap-2.5'>
        {canCreatePlan !== undefined ? (
          <Button asChild size='sm'>
            <Link href={canCreatePlan ? ROUTES.PLANS.NEW : ROUTES.PRICING}>
              {canCreatePlan ? 'Begin tonight' : 'Upgrade'}
            </Link>
          </Button>
        ) : null}
        <Button asChild size='sm' variant='outline'>
          <Link href={ROUTES.PLANS.ROOT}>Browse plans</Link>
        </Button>
      </div>
    </Card>
  );
}
