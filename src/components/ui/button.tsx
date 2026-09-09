import { cn } from '@/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const buttonVariants = cva(
  "inline-flex min-w-0 items-center justify-center gap-[8px] whitespace-normal [overflow-wrap:anywhere] rounded-[8px] border border-transparent text-sm leading-[20px] font-medium transition-[color,background-color,border-color,box-shadow] motion-reduce:transition-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled disabled:text-disabled-foreground disabled:opacity-100 disabled:shadow-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-[20px] [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-[2px] focus-visible:ring-ring focus-visible:ring-offset-[2px] focus-visible:ring-offset-background aria-invalid:border-danger focus-visible:aria-invalid:border-danger cursor-pointer",
  {
    variants: {
      variant: {
        default:
          'bg-action-primary text-action-primary-foreground hover:bg-action-primary-hover active:bg-action-primary-pressed',
        destructive:
          'bg-action-destructive text-action-destructive-foreground hover:bg-action-destructive-hover active:bg-action-destructive-pressed focus-visible:ring-danger',
        outline:
          'border-input bg-card shadow-xs hover:bg-secondary hover:text-secondary-foreground active:bg-accent active:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent',
        ghost:
          'hover:bg-secondary hover:text-secondary-foreground active:bg-accent active:text-accent-foreground',
        link: 'text-link underline-offset-4 hover:text-link-hover hover:underline',
        cta: 'group bg-action-primary text-action-primary-foreground hover:bg-action-primary-hover active:bg-action-primary-pressed',
        'soft-primary':
          'border-link bg-action-soft text-link hover:bg-secondary active:bg-muted',
        success:
          'bg-success text-success-foreground hover:bg-success/90 active:bg-success/80 focus-visible:ring-success',
      },
      size: {
        default:
          'min-h-[40px] px-[16px] py-[8px] has-[>svg]:px-[12px] [@media(pointer:coarse)]:min-h-[44px]',
        sm: 'min-h-[32px] gap-[6px] px-[12px] py-[6px] has-[>svg]:px-[10px] data-[size=sm]:[&_svg:not([class*="size-"])]:size-[16px] [@media(pointer:coarse)]:min-h-[44px]',
        lg: 'min-h-[48px] px-[24px] py-[12px] has-[>svg]:px-[16px] data-[size=lg]:[&_svg:not([class*="size-"])]:size-[24px]',
        icon: 'size-[40px] p-0 [@media(pointer:coarse)]:size-[44px]',
        'icon-sm':
          'size-[32px] p-0 data-[size=icon-sm]:[&_svg:not([class*="size-"])]:size-[16px] [@media(pointer:coarse)]:size-[44px]',
        'icon-lg':
          'size-[48px] p-0 data-[size=icon-lg]:[&_svg:not([class*="size-"])]:size-[24px]',
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
