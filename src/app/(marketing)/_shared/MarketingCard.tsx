import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const marketingCardVariants = cva(
  'group relative overflow-hidden rounded-4xl border p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl motion-reduce:transition-none motion-reduce:hover:translate-y-0',
  {
    variants: {
      variant: {
        default:
          'border-panel-border/50 bg-card/50 dark:border-panel-border/60 dark:bg-panel/50',
        primary:
          'border-primary/30 bg-linear-to-br from-primary/10 to-card/70 dark:border-primary/20 dark:from-primary/5 dark:to-panel/50',
        destructive:
          'border-destructive/30 bg-linear-to-br from-destructive/10 to-card/60 dark:border-destructive/20 dark:from-destructive/5 dark:to-panel/50',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

interface MarketingCardProps extends VariantProps<
  typeof marketingCardVariants
> {
  children: ReactNode;
  className?: string;
  showGlow?: boolean;
}

/**
 * Shared arched glass-card recipe for marketing surfaces.
 */
export function MarketingCard({
  children,
  className,
  variant,
  showGlow = true,
}: MarketingCardProps): ReactNode {
  return (
    <div className={cn(marketingCardVariants({ variant }), className)}>
      {showGlow ? (
        <div
          className='gradient-glow absolute -top-12 -right-12 size-32 opacity-30'
          aria-hidden='true'
        />
      ) : null}
      <div className='relative'>{children}</div>
    </div>
  );
}
