import type { LucideIcon } from 'lucide-react';

import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

interface ComingSoonAlertProps {
  /** Heading text displayed in the alert */
  title: string;
  /** Supporting copy explaining what's coming */
  description: string;
  /** Leading icon – defaults to Sparkles */
  icon?: LucideIcon;
  /** Extra Tailwind classes forwarded to the root element */
  className?: string;
}

export function ComingSoonAlert({
  title,
  description,
  icon: Icon = Sparkles,
  className,
}: ComingSoonAlertProps) {
  return (
    <Surface
      variant='muted'
      padding='compact'
      role='region'
      aria-label='Coming soon'
      className={cn('flex items-start gap-3 sm:gap-4', className)}
    >
      <div className='flex size-8 shrink-0 items-center justify-center rounded-md border border-panel-border bg-panel text-primary shadow-none sm:size-9'>
        <Icon className='size-4' aria-hidden='true' />
      </div>
      <div className='min-w-0 space-y-0.5'>
        <p className='text-sm font-medium text-foreground'>{title}</p>
        <p className='text-sm leading-relaxed text-muted-foreground'>
          {description}
        </p>
      </div>
    </Surface>
  );
}
