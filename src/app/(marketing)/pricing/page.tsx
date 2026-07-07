import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { MarketingPageShell } from '@/app/(marketing)/_shared/MarketingPageShell';
import { PricingFinalCta } from '@/app/(marketing)/pricing/components/PricingFinalCta';
import { ROUTES } from '@/features/navigation/routes';
import { PricingTable } from '@clerk/nextjs';

export const metadata: Metadata = {
  title: 'Pricing | Atlaris',
  description:
    'Compare Atlaris plans and choose the subscription that fits your learning goals.',
};

export default async function PricingPage(): Promise<ReactElement> {
  return (
    <MarketingPageShell withHeaderOffset>
      <div className='px-6 py-10 sm:py-12'>
        <div className='mx-auto flex max-w-screen-xl flex-col items-center gap-y-8'>
          <div className='text-center'>
            <h1 className='marketing-h1 mb-2 text-foreground'>
              Invest in your{' '}
              <span className='gradient-text-symmetric'>growth</span>
            </h1>
            <p className='marketing-subtitle mx-auto max-w-md sm:max-w-xl'>
              Choose the plan that matches your learning ambitions. Start free,
              upgrade when you&apos;re ready.
            </p>
          </div>

          <div className='w-full'>
            <PricingTable
              newSubscriptionRedirectUrl={ROUTES.SETTINGS.BILLING}
            />
          </div>

          <PricingFinalCta />
        </div>
      </div>
    </MarketingPageShell>
  );
}
