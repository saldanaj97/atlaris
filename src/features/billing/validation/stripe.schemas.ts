import { z } from 'zod';

/**
 * Response shape from POST /api/v1/stripe/create-checkout (success).
 * Used by SubscribeButton to validate the response before redirecting.
 */
export const createCheckoutResponseSchema = z.object({
  sessionUrl: z.string().min(1, 'sessionUrl is required'),
});

/**
 * Response shape from POST /api/v1/stripe/create-portal (success).
 * Used by ManageSubscriptionButton to validate the response before redirecting.
 */
export const createPortalResponseSchema = z.object({
  portalUrl: z
    .string()
    .url('portalUrl must be a valid URL')
    .refine((value) => {
      const protocol = new URL(value).protocol;
      return protocol === 'http:' || protocol === 'https:';
    }, 'portalUrl must use http or https'),
});

/**
 * Subset of Stripe Price fields consumed by the pricing page.
 * Guards against Stripe API changes or unexpected field types at runtime.
 */
export const stripePriceFieldsSchema = z.object({
  unit_amount: z.number().int().nullable(),
  currency: z.string().min(1),
});

/**
 * Subset of Stripe Product fields consumed by the pricing page.
 * Handles both active and soft-deleted products.
 */
export const stripeProductFieldsSchema = z.union([
  z.object({ deleted: z.literal(true) }),
  z.object({
    deleted: z.literal(false).optional(),
    name: z.string().optional(),
  }),
]);
