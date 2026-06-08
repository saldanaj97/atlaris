'use client';

import type { JSX } from 'react';

import { MarketingCta } from '@/app/(marketing)/_shared/MarketingCta';
import { useId } from 'react';

export function PricingFinalCta(): JSX.Element {
  const headingId = useId();

  return (
    <MarketingCta
      headingId={headingId}
      title='Start learning for free'
      description='Create your first plan at no cost. Upgrade when you need more capacity.'
      buttonLabel='Get started free'
    />
  );
}
