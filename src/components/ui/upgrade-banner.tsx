import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { ROUTES } from '@/features/navigation/routes';
import { cn } from '@/lib/utils';
import { ArrowRight, Crown } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';

export function UpgradeBanner({
  href = ROUTES.PRICING,
  onNavigate,
  className,
}: {
  href?: string;
  onNavigate?: () => void;
  className?: string;
}): ReactElement {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'rounded-xl border border-panel-border bg-panel p-4',
        className,
      )}
    >
      <div className='flex items-center gap-2'>
        <Crown aria-hidden='true' className='size-4 text-warning' />
        <h2 id={titleId} className='text-sm font-semibold text-foreground'>
          Upgrade to Pro
        </h2>
      </div>
      <p className='mt-2 text-sm leading-relaxed text-muted-foreground'>
        Unlock more learning paths, projects, and features.
      </p>
      <Button
        asChild
        variant='outline'
        className='mt-4 w-full border-panel-border bg-transparent text-foreground hover:bg-muted'
      >
        <Link href={href} onClick={onNavigate}>
          View plans
          <ArrowRight aria-hidden='true' />
        </Link>
      </Button>
    </section>
  );
}
