import type { JSX, ReactNode } from 'react';

import { marketingPrimaryCtaClassName } from '@/app/(marketing)/_shared/marketing-cta';
import { MarketingCard } from '@/app/(marketing)/_shared/MarketingCard';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface MarketingCtaProps {
  headingId: string;
  title: ReactNode;
  description: ReactNode;
  href?: string;
  buttonLabel?: string;
}

/**
 * Canonical marketing CTA section with shared card + button styling.
 */
export function MarketingCta({
  headingId,
  title,
  description,
  href = '/plans/new',
  buttonLabel = 'Get started free',
}: MarketingCtaProps): JSX.Element {
  return (
    <section
      className='relative overflow-hidden py-24 lg:py-32'
      aria-labelledby={headingId}
    >
      <div className='relative z-10 mx-auto max-w-screen-xl px-6 text-center'>
        <MarketingCard className='mx-auto max-w-3xl p-12'>
          <h2 id={headingId} className='marketing-h2 mb-2 text-foreground'>
            {title}
          </h2>
          <p className='marketing-subtitle mx-auto mb-6 max-w-xl lg:mb-10'>
            {description}
          </p>
          <Button
            asChild
            variant='default'
            className={marketingPrimaryCtaClassName}
          >
            <Link href={href}>{buttonLabel}</Link>
          </Button>
        </MarketingCard>
      </div>
    </section>
  );
}
