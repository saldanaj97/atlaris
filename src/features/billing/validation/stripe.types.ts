import type { infer as ZodInfer } from 'zod';
import type {
  createCheckoutResponseSchema,
  createPortalResponseSchema,
  stripePriceFieldsSchema,
  stripeProductFieldsSchema,
} from './stripe.schemas';

export type CreateCheckoutResponse = ZodInfer<
  typeof createCheckoutResponseSchema
>;

export type CreatePortalResponse = ZodInfer<typeof createPortalResponseSchema>;

export type StripePriceFields = ZodInfer<typeof stripePriceFieldsSchema>;

export type StripeProductFields = ZodInfer<typeof stripeProductFieldsSchema>;
