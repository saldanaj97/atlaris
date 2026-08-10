import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { MarketingPageShell } from '@/app/(marketing)/_shared/MarketingPageShell';
import { ClerkPricingTable } from '@/app/(marketing)/pricing/components/ClerkPricingTable';
import { LocalPricingPreview } from '@/app/(marketing)/pricing/components/LocalPricingPreview';
import { PricingShell } from '@/app/(marketing)/pricing/components/PricingShell';
import { buildCheckoutReturnRedirectUrl } from '@/features/billing/checkout-return';
import { getOptionalCheckoutBillingSignature } from '@/features/billing/checkout-return-server';
import { ROUTES } from '@/features/navigation/routes';
import { shouldUseClerkUi } from '@/lib/auth/local-identity';

export const metadata: Metadata = {
  title: 'Pricing | Atlaris',
  description:
    'Compare Atlaris plans and choose the subscription that fits your learning goals.',
};

/** Clerk Billing appearance aligned to After Hours semantic tokens. */
const pricingAppearance = {
  variables: {
    borderRadius: '2rem',
    colorBackground: 'transparent',
    colorPrimary: 'var(--primary)',
    colorText: 'var(--foreground)',
    colorTextSecondary: 'var(--muted-foreground)',
    fontFamily: 'var(--font-family-display)',
  },
  elements: {
    rootBox: 'w-full',
    pricingTable: 'w-full',
    pricingTableCard: 'shadow-none',
  },
} as const;

export default async function PricingPage(): Promise<ReactElement> {
  const showClerkBilling = shouldUseClerkUi();
  const checkoutBaseline = showClerkBilling
    ? await getOptionalCheckoutBillingSignature()
    : null;
  const checkoutReturnUrl = buildCheckoutReturnRedirectUrl(
    ROUTES.SETTINGS.ROOT,
    checkoutBaseline,
  );

  return (
    <MarketingPageShell>
      <PricingShell>
        {showClerkBilling ? (
          <ClerkPricingTable
            appearance={pricingAppearance}
            newSubscriptionRedirectUrl={checkoutReturnUrl}
          />
        ) : (
          <LocalPricingPreview />
        )}
      </PricingShell>
    </MarketingPageShell>
  );
}
