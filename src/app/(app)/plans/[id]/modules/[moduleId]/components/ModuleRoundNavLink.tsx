import { cn } from '@/lib/utils';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export function ModuleRoundNavLink({
  planId,
  targetModuleId,
  direction,
}: {
  planId: string;
  targetModuleId: string | null;
  direction: 'previous' | 'next';
}) {
  const Icon = direction === 'previous' ? ArrowLeft : ArrowRight;
  const ariaLabel =
    direction === 'previous' ? 'Previous module' : 'Next module';
  const disabledAriaLabel =
    direction === 'previous'
      ? 'No previous module available'
      : 'No next module available';

  if (!targetModuleId) {
    return (
      <button
        type='button'
        className='cursor-not-allowed rounded-full bg-muted p-2 text-muted-foreground/40'
        disabled
        aria-label={disabledAriaLabel}
      >
        <Icon className='size-4' />
      </button>
    );
  }

  return (
    <Link
      href={`/plans/${planId}/modules/${targetModuleId}`}
      className={cn(
        'rounded-full border border-border/60 bg-muted p-2 text-foreground transition-colors',
        'hover:bg-muted/80 hover:text-primary',
      )}
      aria-label={ariaLabel}
    >
      <Icon className='size-4' />
    </Link>
  );
}
