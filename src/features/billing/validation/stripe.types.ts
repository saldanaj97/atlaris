import type { infer as ZodInfer } from 'zod';

type StripeValidationModule = typeof import('./stripe');

export type CreateCheckoutResponse = ZodInfer<
  StripeValidationModule['createCheckoutResponseSchema']
>;

export type CreatePortalResponse = ZodInfer<
  StripeValidationModule['createPortalResponseSchema']
>;

export type StripePriceFields = ZodInfer<
  StripeValidationModule['stripePriceFieldsSchema']
>;

export type StripeProductFields = ZodInfer<
  StripeValidationModule['stripeProductFieldsSchema']
>;
