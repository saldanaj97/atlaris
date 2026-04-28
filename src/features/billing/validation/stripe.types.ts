import type { infer as ZodInfer } from 'zod';
import type {
  stripePriceFieldsSchema,
  stripeProductFieldsSchema,
} from './stripe.schemas';

export type StripePriceFields = ZodInfer<typeof stripePriceFieldsSchema>;

export type StripeProductFields = ZodInfer<typeof stripeProductFieldsSchema>;
