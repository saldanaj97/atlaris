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
      apiVersion: '2025-09-30.clover',
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
export const stripe =
  process.env.STRIPE_SECRET_KEY !== undefined
    ? getStripe()
    : (null as unknown as Stripe);
