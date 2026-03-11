import Stripe from 'stripe';
import { stripeEnv } from '@/lib/config/env';

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
  if (!stripeInstance) {
    let secretKey: string;
    try {
      secretKey = stripeEnv.secretKey;
    } catch {
      throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
    }

    stripeInstance = new Stripe(secretKey, {
      // Let SDK use its default pinned API version; tests assert initialization only
      typescript: true,
      telemetry: false,
    });
  }

  return stripeInstance;
}
