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
  portalUrl: z.string().min(1, 'portalUrl is required'),
});

export type CreateCheckoutResponse = z.infer<
  typeof createCheckoutResponseSchema
>;

export type CreatePortalResponse = z.infer<typeof createPortalResponseSchema>;
