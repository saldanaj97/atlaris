import type { ReactNode } from 'react';

const marketingHeroEnterClassName =
  'motion-reduce:animate-none animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-700';

interface MarketingHeroProps {
  headingId: string;
  badge?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
}

/**
 * Shared marketing hero layout: badge, display heading, and subtitle.
 */
export function MarketingHero({
  headingId,
  badge,
  title,
  subtitle,
}: MarketingHeroProps): ReactNode {
  return (
    <section
      className='relative py-10 sm:py-16 lg:py-20'
      aria-labelledby={headingId}
    >
      <div className='relative z-10 mx-auto flex max-w-screen-xl flex-col items-center px-6 text-center'>
        <div className='flex flex-col items-center space-y-6'>
          {badge ? (
            <div className={`${marketingHeroEnterClassName} delay-0`}>
              {badge}
            </div>
          ) : null}
          <h1
            id={headingId}
            className={`marketing-h1 mx-auto max-w-4xl text-foreground ${marketingHeroEnterClassName} delay-150`}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              className={`marketing-subtitle mx-auto mt-6 max-w-2xl ${marketingHeroEnterClassName} delay-300`}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
