import { Button } from '@/components/ui/button';
import { ROUTES } from '@/features/navigation/routes';
import Link from 'next/link';

/**
 * Quiet empty feed — soft fill plate instead of ops-style empty chrome.
 */
export function EmptyActivityState() {
  return (
    <div className='rounded-2xl border border-panel-border bg-secondary/50 px-5 py-10 text-center'>
      <div className='mx-auto mb-4 flex size-10 items-center justify-center rounded-full border border-panel-border bg-muted'>
        <span className='size-2 rounded-full bg-primary' aria-hidden='true' />
      </div>
      <p className='text-sm font-semibold text-foreground'>No activity yet</p>
      <p className='mx-auto mt-1.5 max-w-sm text-sm font-normal text-muted-foreground'>
        Signals appear as you start plans and mark work complete.
      </p>
      <Button
        asChild
        className='mt-5 h-9 rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/90'
      >
        <Link href={ROUTES.PLANS.NEW}>Create a plan</Link>
      </Button>
    </div>
  );
}
