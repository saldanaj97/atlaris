import * as React from 'react';

import { tornPaperSurfaceClasses } from '@/components/shared/paper-surface';
import { cn } from '@/lib/utils';

type PaperProps = React.ComponentProps<'div'> & {
  tornSeed?: number | string;
};

/**
 * Paper - A generic component that provides a realistic torn paper aesthetic
 *
 * Features:
 * - Rough, sketchy hand-drawn borders with torn edges
 * - Subtle paper texture overlay
 * - Realistic depth shadows that simulate paper lifting
 * - Heavy hatched shadow for sketch effect
 *
 * Use this component for any element that needs the torn paper look
 * but isn't necessarily a card (e.g., headers, containers, etc.)
 */
function Paper({ className, tornSeed, ...props }: PaperProps) {
  const renderSeed = tornSeed ?? React.useId();

  return (
    <div
      data-slot="paper"
      className={cn(tornPaperSurfaceClasses(renderSeed), className)}
      {...props}
    />
  );
}

export { Paper };
