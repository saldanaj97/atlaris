import type Stripe from 'stripe';
import { getStripe } from '@/features/billing/client';
import {
  DefaultStripeCommerceBoundary,
  type StripeCommerceBoundaryDeps,
} from '@/features/billing/stripe-commerce/boundary-impl';
import type { StripeGateway } from '@/features/billing/stripe-commerce/gateway';
import { LiveStripeGateway } from '@/features/billing/stripe-commerce/live-gateway';
import type { StripeCommerceBoundary } from '@/features/billing/stripe-commerce/types';
import { appEnv, localProductTestingEnv, stripeEnv } from '@/lib/config/env';
import { getDb } from '@/lib/db/runtime';
import { users } from '@/lib/db/schema';
import { db as serviceRoleDb } from '@/lib/db/service-role';

let commerceBoundarySingleton: StripeCommerceBoundary | null = null;

/**
 * Shared Stripe client for billing features (delegates to `getStripe()` in
 * `client.ts` to avoid circular imports with the commerce boundary).
 */
export function getBillingStripeClient(): Stripe {
  return getStripe();
}

export type CreateStripeCommerceBoundaryOptions = Partial<
  Omit<StripeCommerceBoundaryDeps, 'gateway'>
> & {
  gateway?: StripeGateway;
};

/**
 * Builds a commerce boundary with injectable collaborators (used in tests).
 */
export function createStripeCommerceBoundary(
  options: CreateStripeCommerceBoundaryOptions = {}
): StripeCommerceBoundary {
  const gateway =
    options.gateway ?? new LiveStripeGateway(getBillingStripeClient());

  return new DefaultStripeCommerceBoundary({
    gateway,
    localMode: options.localMode ?? stripeEnv.localMode,
    getDb: options.getDb ?? getDb,
    serviceRoleDb: options.serviceRoleDb ?? serviceRoleDb,
    users: options.users ?? users,
    webhookSecret: options.webhookSecret ?? stripeEnv.webhookSecret ?? null,
    webhookDevMode: options.webhookDevMode ?? stripeEnv.webhookDevMode,
    isProduction: options.isProduction ?? appEnv.isProduction,
    isDevOrTest: options.isDevOrTest ?? (appEnv.isDevelopment || appEnv.isTest),
  });
}

/**
 * Default app singleton for API routes.
 */
export function getStripeCommerceBoundary(): StripeCommerceBoundary {
  if (!commerceBoundarySingleton) {
    commerceBoundarySingleton = createStripeCommerceBoundary();
  }
  return commerceBoundarySingleton;
}

/**
 * Whether the local Stripe completion redirect route should be active.
 * Centralizes `STRIPE_LOCAL_MODE` + local product testing gating.
 */
export function isLocalStripeCompletionRouteEnabled(): boolean {
  return stripeEnv.localMode && localProductTestingEnv.enabled;
}
