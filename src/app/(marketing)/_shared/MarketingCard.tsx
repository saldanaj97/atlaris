import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const marketingCardVariants = cva(
  'group relative overflow-hidden rounded-3xl border p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl motion-reduce:transition-none motion-reduce:hover:translate-y-0',
  {
    variants: {
      variant: {
        default:
          'border-white/50 bg-white/40 dark:border-white/10 dark:bg-card/40',
        primary:
          'border-primary/30 bg-linear-to-br from-primary/10 to-white/60 dark:border-primary/20 dark:from-primary/5 dark:to-card/40',
        destructive:
          'border-destructive/30 bg-linear-to-br from-destructive/10 to-white/50 dark:border-destructive/20 dark:from-destructive/5 dark:to-card/40',
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
 * Shared glass-card recipe for marketing surfaces.
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
