import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { LandingPageShell } from '@/app/(landing)/_shared/LandingPageShell';
import { ClerkPricingTable } from '@/app/(landing)/pricing/components/ClerkPricingTable';
import { LocalPricingPreview } from '@/app/(landing)/pricing/components/LocalPricingPreview';
import { PricingShell } from '@/app/(landing)/pricing/components/PricingShell';
import { buildCheckoutReturnRedirectUrl } from '@/features/billing/checkout-return';
import { getOptionalCheckoutBillingSignature } from '@/features/billing/checkout-return-server';
import { ROUTES } from '@/features/navigation/routes';
import { shouldUseClerkUi } from '@/lib/auth/local-identity';
import { FLAG_OVERRIDES_COOKIE, resolveSiteGate } from '@/lib/proxy/site-gate';
import { cookies } from 'next/headers';

export const metadata: Metadata = {
  title: 'Pricing | Atlaris',
  description:
    'Compare Atlaris plans and choose the subscription that fits your learning goals.',
};

export default async function PricingPage(): Promise<ReactElement> {
  const showClerkBilling = shouldUseClerkUi();
  // The proxy keeps /pricing live while a site gate is on; skip the account DB read.
  const appClosed =
    (await resolveSiteGate({
      bypassCache: (await cookies()).has(FLAG_OVERRIDES_COOKIE),
    })) !== null;
  const checkoutBaseline =
    showClerkBilling && !appClosed
      ? await getOptionalCheckoutBillingSignature()
      : null;
  const checkoutReturnUrl = buildCheckoutReturnRedirectUrl(
    ROUTES.SETTINGS.BILLING,
    checkoutBaseline,
  );

  return (
    <LandingPageShell>
      <PricingShell>
        {showClerkBilling ? (
          <ClerkPricingTable
            appClosed={appClosed}
            newSubscriptionRedirectUrl={checkoutReturnUrl}
          />
        ) : (
          <LocalPricingPreview />
        )}
      </PricingShell>
    </LandingPageShell>
  );
}
