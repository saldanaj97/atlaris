import { cn } from '@/lib/utils';

interface TimelinePlanFooterProps {
  isPlanComplete: boolean;
  moduleCount: number;
}

/** Quiet end-of-route marker: a dot on the rail and one line of text. */
export function TimelinePlanFooter({
  isPlanComplete,
  moduleCount,
}: TimelinePlanFooterProps) {
  const moduleLabel = `${moduleCount} module${moduleCount !== 1 ? 's' : ''}`;

  return (
    <div className='mt-5 flex items-center'>
      <div className='relative flex w-16 shrink-0 items-center justify-center'>
        <span
          className={cn(
            'z-10 size-2.5 rounded-full border-2 bg-panel',
            isPlanComplete ? 'border-success bg-success' : 'border-border',
          )}
          aria-hidden='true'
        />
      </div>
      <p className='flex-1 py-3 text-xs text-muted-foreground'>
        {isPlanComplete
          ? `Route complete · ${moduleLabel} finished`
          : `End of route · ${moduleLabel} charted`}
      </p>
    </div>
  );
}
