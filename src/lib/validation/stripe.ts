import { z } from 'zod';

/**
 * Response shape from POST /api/v1/stripe/create-checkout (success).
 * Used by SubscribeButton to validate the response before redirecting.
 */
export const createCheckoutResponseSchema = z.object({
  sessionUrl: z.string().min(1, 'sessionUrl is required'),
});

export type CreateCheckoutResponse = z.infer<
  typeof createCheckoutResponseSchema
>;
