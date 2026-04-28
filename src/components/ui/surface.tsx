import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const surfaceVariants = cva(
  'rounded-2xl border text-panel-foreground transition-[box-shadow,background-color]',
  {
    variants: {
      variant: {
        default: 'border-panel-border bg-panel shadow-sm',
        muted: 'border-panel-border bg-panel-muted shadow-sm',
        interactive: 'border-panel-border bg-panel shadow-sm hover:shadow-md',
        inset: 'border-border/80 bg-muted/40 shadow-none dark:bg-muted/25',
      },
      padding: {
        none: '',
        comfortable: 'p-5',
        compact: 'p-4',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'comfortable',
    },
  },
);

/**
 * Token-backed product panel; avoid marketing glass (`backdrop-blur`, `bg-white/30`) here.
 */
function Surface({
  className,
  variant,
  padding,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof surfaceVariants>) {
  return (
    <div
      data-slot="surface"
      className={cn(surfaceVariants({ variant, padding }), className)}
      {...props}
    />
  );
}

export { Surface, surfaceVariants };
