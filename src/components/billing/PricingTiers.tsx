import { TIER_LIMITS } from '../../lib/stripe/tier-limits';
import Link from 'next/link';

export const PRICING_TIERS = {
  free: {
    name: 'Free',
    price: '$0',
    features: [
      `${TIER_LIMITS.free.maxActivePlans} active plans`,
      `${TIER_LIMITS.free.monthlyRegenerations} regenerations per month`,
      `${TIER_LIMITS.free.monthlyExports} exports per month`,
    ],
    button: <Link href="/dashboard">Continue Free</Link>,
    variant: 'default' as const,
    badge: 'Current',
    recommended: false,
  },
  starter: {
    name: 'Starter',
    price: null, // Dynamic from Stripe
    features: [
      `${TIER_LIMITS.starter.maxActivePlans} active plans`,
      `${TIER_LIMITS.starter.monthlyRegenerations} regenerations per month`,
      `${TIER_LIMITS.starter.monthlyExports} exports per month`,
      'Priority topics and faster queue',
    ],
    button: null, // Dynamic SubscribeButtons
    variant: 'default' as const,
    badge: 'Popular',
    recommended: true,
  },
  pro: {
    name: 'Pro',
    price: null, // Dynamic from Stripe
    features: [
      'Unlimited active plans',
      `${TIER_LIMITS.pro.monthlyRegenerations} regenerations per month`,
      'Unlimited exports',
      'Priority topics and faster queue + analytics',
    ],
    button: null, // Dynamic SubscribeButtons
    variant: 'default' as const,
    badge: 'Best',
    recommended: false,
  },
} as const;

export type TierKey = keyof typeof PRICING_TIERS;
export type PricingTier = (typeof PRICING_TIERS)[TierKey];
