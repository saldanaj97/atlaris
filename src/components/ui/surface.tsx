import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const surfaceVariants = cva(
  'min-w-0 rounded-[12px] border text-panel-foreground transition-[box-shadow,background-color,border-color]',
  {
    variants: {
      variant: {
        default: 'border-border bg-panel shadow-sm',
        muted: 'border-border bg-panel-muted shadow-sm',
        interactive:
          'border-border bg-panel shadow-sm hover:border-input hover:bg-panel-muted hover:shadow-md',
        inset: 'border-border bg-background shadow-none',
      },
      padding: {
        none: '',
        comfortable: 'p-[24px]',
        compact: 'p-[16px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'comfortable',
    },
  },
);

/**
 * Token-backed product panel; avoid marketing glass (`backdrop-blur`, `bg-card/*` frosts) here.
 */
function Surface({
  className,
  variant,
  padding,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof surfaceVariants>) {
  return (
    <div
      data-slot='surface'
      className={cn(surfaceVariants({ variant, padding }), className)}
      {...props}
    />
  );
}

export { Surface, surfaceVariants };
