import type { JSX, ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface MarketingSectionProps {
  headingId: string;
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  badgeClassName?: string;
  children: ReactNode;
  className?: string;
  containerClassName?: string;
  id?: string;
}

/**
 * Marketing section shell: spacing, max-width, optional badge, centered title stack.
 */
export function MarketingSection({
  headingId,
  title,
  subtitle,
  badge,
  badgeClassName,
  children,
  className,
  containerClassName,
  id,
}: MarketingSectionProps): JSX.Element {
  return (
    <section
      id={id}
      className={cn('relative py-12 sm:py-24 lg:py-32', className)}
      aria-labelledby={headingId}
    >
      <div
        className={cn(
          'relative z-10 mx-auto max-w-screen-xl px-6',
          containerClassName,
        )}
      >
        <div className='mb-16 text-center'>
          {badge ? (
            <Badge
              variant='glassmorphic'
              className={cn('mb-4 px-4 py-1.5', badgeClassName)}
            >
              {badge}
            </Badge>
          ) : null}
          <h2 id={headingId} className='marketing-h2 mb-4 text-foreground'>
            {title}
          </h2>
          {subtitle ? (
            <p className='marketing-subtitle mx-auto max-w-2xl'>{subtitle}</p>
          ) : null}
        </div>

        {children}
      </div>
    </section>
  );
}
