import Stripe from 'stripe';
import {
  getLocalStripeMock,
  resolveStripeClientBaseUrl,
} from '@/features/billing/stripe-commerce/local-gateway';
import { stripeEnv } from '@/lib/config/env';
import { EnvValidationError } from '@/lib/config/env/shared';

/**
 * Stripe client singleton for billing features.
 * Lazily initialized to avoid errors during build when env vars might not be available.
 */
let stripeInstance: Stripe | null = null;

/**
 * Get or create the Stripe client instance (live SDK or local in-process mock).
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
      if (err instanceof EnvValidationError) {
        throw new Error(
          'STRIPE_SECRET_KEY is not set in environment variables'
        );
      }
      throw err;
    }

    stripeInstance = new Stripe(secretKey, {
      typescript: true,
      telemetry: false,
    });
  }

  return stripeInstance;
}
