import { Button } from '@/components/ui/button';
import { ROUTES } from '@/features/navigation/routes';
import Link from 'next/link';

/**
 * Empty-state hero when there is no active plan — same panel plate as the
 * resume hero, quiet ruled note instead of a nested box.
 */
export function StartTonightCard({
  canCreatePlan,
}: {
  canCreatePlan?: boolean;
}) {
  return (
    <article className='rounded-2xl border border-panel-border bg-panel p-6 text-panel-foreground shadow-sm animate-dashboard-unfold [--dashboard-entry-x:-0.75rem] motion-reduce:animate-none sm:p-7'>
      <p className='text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase'>
        Tonight&apos;s table
      </p>

      <h2 className='mt-3 text-2xl font-semibold text-balance text-foreground'>
        Your next plan is waiting
      </h2>

      <p className='mt-2 max-w-xl text-sm text-muted-foreground'>
        Create a learning map and pick up whenever the night is quiet.
      </p>

      <div className='mt-6 flex flex-wrap items-center gap-2'>
        {canCreatePlan !== undefined ? (
          <Button asChild>
            <Link href={canCreatePlan ? ROUTES.PLANS.NEW : ROUTES.PRICING}>
              {canCreatePlan ? 'Begin tonight' : 'Upgrade'}
            </Link>
          </Button>
        ) : null}
        <Button asChild variant='ghost'>
          <Link href={ROUTES.PLANS.ROOT}>Browse plans</Link>
        </Button>
      </div>

      <p className='mt-6 border-t border-border/50 pt-4 text-xs text-muted-foreground'>
        Start with a topic you care about — Atlaris will chart the path.
      </p>
    </article>
  );
}
