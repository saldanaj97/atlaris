import { cn } from '@/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger cursor-pointer",
  {
    variants: {
      variant: {
        default:
          'bg-action-primary text-action-primary-foreground hover:bg-action-primary-hover active:bg-action-primary-pressed',
        destructive:
          'bg-action-destructive text-action-destructive-foreground hover:bg-action-destructive-hover active:bg-action-destructive-pressed focus-visible:ring-danger',
        outline:
          'border border-input bg-card shadow-xs hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost:
          'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-link underline-offset-4 hover:text-link-hover hover:underline',
        cta: 'group rounded-lg bg-action-primary text-action-primary-foreground shadow-lg shadow-action-primary/20 hover:-translate-y-0.5 hover:bg-action-primary-hover hover:shadow-xl hover:shadow-action-primary/25 active:bg-action-primary-pressed',
        'soft-primary':
          'border border-link/25 bg-action-primary/10 text-link hover:border-link/35 hover:bg-action-primary/15',
        success:
          'bg-success text-success-foreground hover:bg-success/90 focus-visible:ring-success',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

/** Renders a styled button or Slot-wrapped control with variant and size options. */
function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot='button'
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
