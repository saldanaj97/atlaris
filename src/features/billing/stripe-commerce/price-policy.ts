import { isLocalPriceId } from '@/features/billing/local-catalog';
import { isAllowedCheckoutPriceId } from '@/features/billing/price-catalog';
import { ValidationError } from '@/lib/api/errors';

/**
 * Enforces checkout price policy for live vs local Stripe catalog.
 */
export function assertCheckoutPriceAllowed(
  localMode: boolean,
  priceId: string
): void {
  if (localMode && !isLocalPriceId(priceId)) {
    throw new ValidationError(
      'priceId must be a canonical local catalog id when STRIPE_LOCAL_MODE is enabled'
    );
  }

  if (!localMode && !isAllowedCheckoutPriceId(priceId)) {
    throw new ValidationError('priceId must match an approved billing plan');
  }
}
