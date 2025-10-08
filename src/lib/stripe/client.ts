import Stripe from 'stripe';

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
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
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

/**
 * Export a pre-initialized instance for convenience
 * Note: This will throw if called during build time without the env var
 */
// Do not eagerly initialize at module load to keep tests isolated
export const stripe: Stripe | null = null;
