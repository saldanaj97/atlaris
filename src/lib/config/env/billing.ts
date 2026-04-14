import { LOCAL_PRICE_IDS } from '@/features/billing/local-catalog';
import {
  getServerOptional,
  getServerRequired,
  toBoolean,
} from '@/lib/config/env/shared';

function getRequiredPriceId(key: string): string {
  return getServerRequired(key);
}

export const stripeEnv = {
  /**
   * Use in-process Stripe mocks and canonical local price ids (development/test only).
   */
  get localMode(): boolean {
    return toBoolean(getServerOptional('STRIPE_LOCAL_MODE'), false);
  },
  get secretKey(): string {
    if (this.localMode) {
      return (
        getServerOptional('STRIPE_SECRET_KEY') ?? 'sk_test_local_placeholder'
      );
    }
    return getServerRequired('STRIPE_SECRET_KEY');
  },
  get webhookSecret(): string | undefined {
    return getServerOptional('STRIPE_WEBHOOK_SECRET');
  },
  get webhookDevMode(): boolean {
    return toBoolean(getServerOptional('STRIPE_WEBHOOK_DEV_MODE'), false);
  },
  pricing: {
    get starterMonthly(): string {
      if (stripeEnv.localMode) {
        return LOCAL_PRICE_IDS.starterMonthly;
      }
      return getRequiredPriceId('STRIPE_STARTER_MONTHLY_PRICE_ID');
    },
    get proMonthly(): string {
      if (stripeEnv.localMode) {
        return LOCAL_PRICE_IDS.proMonthly;
      }
      return getRequiredPriceId('STRIPE_PRO_MONTHLY_PRICE_ID');
    },
    get starterYearly(): string {
      if (stripeEnv.localMode) {
        return LOCAL_PRICE_IDS.starterYearly;
      }
      return getRequiredPriceId('STRIPE_STARTER_YEARLY_PRICE_ID');
    },
    get proYearly(): string {
      if (stripeEnv.localMode) {
        return LOCAL_PRICE_IDS.proYearly;
      }
      return getRequiredPriceId('STRIPE_PRO_YEARLY_PRICE_ID');
    },
  },
} as const;
