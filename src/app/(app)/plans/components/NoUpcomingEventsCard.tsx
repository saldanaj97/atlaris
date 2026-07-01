import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { ROUTES } from '@/features/navigation/routes';
import { Calendar } from 'lucide-react';
import Link from 'next/link';

export function NoUpcomingEventsCard() {
  return (
    <Surface className='border-sidebar-border bg-sidebar text-sidebar-foreground'>
      <div className='flex flex-col items-center py-6 text-center'>
        <div className='mb-4 flex size-12 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground'>
          <Calendar className='size-6' />
        </div>
        <h3 className='mb-2 font-medium text-sidebar-foreground'>
          No upcoming events
        </h3>
        <p className='mb-4 text-sm text-sidebar-foreground/70'>
          Add sessions to your active plan to keep learning momentum.
        </p>
        <Button asChild>
          <Link href={ROUTES.PLANS.ROOT}>View Plans</Link>
        </Button>
      </div>
    </Surface>
  );
}
