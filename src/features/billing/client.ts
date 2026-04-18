import Stripe from 'stripe';
import {
  getLocalStripeMock,
  resolveStripeClientBaseUrl,
} from '@/features/billing/local-stripe';
import { stripeEnv } from '@/lib/config/env';
import { EnvValidationError } from '@/lib/config/env/shared';

/**
 * Stripe client singleton
 * Lazily initialized to avoid errors during build when env vars might not be available
 */
let stripeInstance: Stripe | null = null;

/**
 * Get or create the Stripe client instance
 * @returns Configured Stripe client
 * @throws Error if STRIPE_SECRET_KEY is not set
 */
export function getStripe(): Stripe {
  if (stripeEnv.localMode) {
    return getLocalStripeMock(resolveStripeClientBaseUrl());
  }

  if (!stripeInstance) {
    let secretKey: string;
    try {
      secretKey = stripeEnv.secretKey;
    } catch (err) {
      // Only translate the env-validation case to a user-facing message; any
      // other unexpected error must propagate so we can debug it.
      if (err instanceof EnvValidationError) {
        throw new Error(
          'STRIPE_SECRET_KEY is not set in environment variables'
        );
      }
      throw err;
    }

    stripeInstance = new Stripe(secretKey, {
      // Let SDK use its default pinned API version; tests assert initialization only
      typescript: true,
      telemetry: false,
    });
  }

  return stripeInstance;
}
