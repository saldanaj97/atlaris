import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

const marketingHeroEnterClassName =
  'motion-reduce:animate-none animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-700';

interface MarketingHeroProps {
  headingId: string;
  badge?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  cta?: ReactNode;
  /** Optional below-the-fold visual (e.g. product mock). */
  visual?: ReactNode;
  variant?: 'landing' | 'centered';
  className?: string;
}

/**
 * Shared marketing hero layout: badge, display heading, subtitle, optional CTA and visual.
 */
export function MarketingHero({
  headingId,
  badge,
  title,
  subtitle,
  cta,
  visual,
  variant = 'centered',
  className,
}: MarketingHeroProps): ReactNode {
  const isLanding = variant === 'landing';

  return (
    <section
      className={cn(
        'relative',
        isLanding
          ? 'py-10 sm:py-12 lg:pt-12 lg:pb-10'
          : 'py-10 sm:py-16 lg:py-20',
        className,
      )}
      aria-labelledby={headingId}
    >
      <div
        className={cn(
          'relative z-10 mx-auto flex flex-col items-center px-6 text-center',
          isLanding ? 'pb-28 sm:pb-32 lg:pb-24' : 'max-w-screen-xl',
        )}
      >
        <div
          className={cn(
            'flex flex-col items-center',
            isLanding ? 'space-y-6 lg:flex-1 lg:justify-center' : 'space-y-6',
          )}
        >
          {badge ? (
            <div className={cn(marketingHeroEnterClassName, 'delay-0')}>
              {badge}
            </div>
          ) : null}
          <h1
            id={headingId}
            className={cn(
              'marketing-h1 text-foreground',
              marketingHeroEnterClassName,
              'delay-150',
              isLanding ? 'max-w-4xl' : 'mx-auto max-w-4xl',
            )}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              className={cn(
                'marketing-subtitle',
                marketingHeroEnterClassName,
                'delay-300',
                isLanding ? 'max-w-lg md:max-w-2xl' : 'mx-auto mt-6 max-w-2xl',
              )}
            >
              {subtitle}
            </p>
          ) : null}
          {cta ? (
            <div className={cn(marketingHeroEnterClassName, 'delay-500')}>
              {cta}
            </div>
          ) : null}
        </div>

        {visual ? (
          <div
            className={cn(
              'relative w-full',
              marketingHeroEnterClassName,
              'delay-700',
              isLanding
                ? 'mt-8 -mb-20 w-full max-w-7xl md:mt-4 md:-mb-28 lg:mt-0 lg:-mb-32'
                : 'mt-12 max-w-7xl',
            )}
          >
            {visual}
          </div>
        ) : null}
      </div>
    </section>
  );
}
