import type { ReactNode } from 'react';

import { LiquidGlassButton } from '@/app/(marketing)/_shared/LiquidGlassButton';
import { MarketingCard } from '@/app/(marketing)/_shared/MarketingCard';
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
}: MarketingCtaProps): ReactNode {
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
          <LiquidGlassButton asChild>
            <Link href={href}>{buttonLabel}</Link>
          </LiquidGlassButton>
        </MarketingCard>
      </div>
    </section>
  );
}
