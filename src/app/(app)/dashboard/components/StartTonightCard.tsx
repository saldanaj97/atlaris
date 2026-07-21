import { Button } from '@/components/ui/button';
import { ROUTES } from '@/features/navigation/routes';
import Link from 'next/link';

/**
 * Empty-state hero when there is no active plan — same arched After Hours plate.
 */
export function StartTonightCard() {
  return (
    <article className='rounded-[1.75rem] border border-panel-border bg-panel p-6 text-panel-foreground sm:p-7'>
      <p className='mb-3 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase'>
        Tonight&apos;s table
      </p>

      <h2 className='text-xl font-semibold text-balance text-foreground sm:text-2xl'>
        Your next plan is waiting
      </h2>

      <p className='mt-2 max-w-xl text-sm font-normal text-muted-foreground'>
        Create a learning map and pick up whenever the night is quiet.
      </p>

      {/* noteBg well for quiet emphasis */}
      <div className='mt-5 rounded-2xl border border-panel-border bg-muted px-4 py-3'>
        <p className='text-sm text-muted-foreground'>
          Start with a topic you care about — Atlaris will chart the path.
        </p>
      </div>

      <div className='mt-6 flex flex-col gap-2 sm:flex-row sm:items-center'>
        <Button
          asChild
          className='h-10 rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/90'
        >
          <Link href={ROUTES.PLANS.NEW}>Begin tonight</Link>
        </Button>
        <Button
          asChild
          variant='outline'
          className='h-10 rounded-full border-panel-border bg-panel px-5 text-panel-foreground hover:bg-secondary hover:text-foreground'
        >
          <Link href={ROUTES.PLANS.ROOT}>Browse plans</Link>
        </Button>
      </div>
    </article>
  );
}
