import type {
  stripePriceFieldsSchema,
  stripeProductFieldsSchema,
} from './stripe.schemas';
import type { infer as ZodInfer } from 'zod';

export type StripePriceFields = ZodInfer<typeof stripePriceFieldsSchema>;

export type StripeProductFields = ZodInfer<typeof stripeProductFieldsSchema>;
