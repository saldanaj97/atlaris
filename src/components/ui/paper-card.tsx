import * as React from 'react';

import { tornPaperSurfaceClasses } from '@/components/shared/TornPaperStyles';
import { cn } from '@/lib/utils';

type PaperCardProps = React.ComponentProps<'div'> & {
  tornSeed?: number | string;
};

/**
 * PaperCard - A card component with a realistic torn paper aesthetic
 *
 * Features:
 * - Rough, sketchy hand-drawn borders
 * - Subtle paper texture overlay
 * - Realistic depth shadows that simulate paper lifting
 * - Heavy hatched shadow for sketch effect
 */
function PaperCard({ className, tornSeed, ...props }: PaperCardProps) {
  const renderSeed = tornSeed ?? React.useId();

  return (
    <div
      data-slot="paper-card"
      className={cn(
        'flex flex-col gap-6 py-6 text-foreground font-base',
        tornPaperSurfaceClasses(renderSeed),
        className
      )}
      {...props}
    />
  );
}

function PaperCardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="paper-card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6',
        'has-[data-slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
        className
      )}
      {...props}
    />
  );
}

function PaperCardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="paper-card-title"
      className={cn('font-heading leading-none', className)}
      {...props}
    />
  );
}

function PaperCardDescription({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="paper-card-description"
      className={cn('text-sm font-base text-muted-foreground', className)}
      {...props}
    />
  );
}

function PaperCardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="paper-card-action"
      className={cn(
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
        className
      )}
      {...props}
    />
  );
}

function PaperCardContent({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="paper-card-content"
      className={cn('px-6 relative z-10', className)}
      {...props}
    />
  );
}

function PaperCardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="paper-card-footer"
      className={cn(
        'flex items-center px-6 [.border-t]:pt-6 relative z-10',
        className
      )}
      {...props}
    />
  );
}

export {
  PaperCard, PaperCardAction, PaperCardContent, PaperCardDescription, PaperCardFooter, PaperCardHeader, PaperCardTitle
};
