import { TIER_LIMITS } from '@/lib/stripe/tier-limits';

interface TierConfig {
  name: string;
  price: string | null;
  description: string;
  features: string[];
  badge: string;
  recommended: boolean;
}

export const PRICING_TIERS = {
  free: {
    name: 'Free',
    price: '$0',
    description: 'Get started with structured learning plans.',
    features: [
      `${TIER_LIMITS.free.maxActivePlans} active learning plans`,
      `${TIER_LIMITS.free.monthlyRegenerations} plan regenerations per month`,
      `${TIER_LIMITS.free.monthlyExports} exports per month`,
      `PDF imports up to ${TIER_LIMITS.free.maxPdfPages} pages`,
      `${TIER_LIMITS.free.maxWeeks}-week scheduling horizon`,
    ],
    badge: 'Free',
    recommended: false,
  },
  starter: {
    name: 'Starter',
    price: null,
    description: 'For dedicated learners ready to go further.',
    features: [
      `${TIER_LIMITS.starter.maxActivePlans} active learning plans`,
      `${TIER_LIMITS.starter.monthlyRegenerations} plan regenerations per month`,
      `${TIER_LIMITS.starter.monthlyExports} exports per month`,
      `PDF imports up to ${TIER_LIMITS.starter.maxPdfPages} pages`,
      `${TIER_LIMITS.starter.maxWeeks}-week scheduling horizon`,
      'Priority queue access',
    ],
    badge: 'Most Popular',
    recommended: true,
  },
  pro: {
    name: 'Pro',
    price: null,
    description: 'Unlimited power for serious learners.',
    features: [
      'Unlimited active plans',
      `${TIER_LIMITS.pro.monthlyRegenerations} plan regenerations per month`,
      'Unlimited exports',
      `PDF imports up to ${TIER_LIMITS.pro.maxPdfPages} pages`,
      'Unlimited scheduling horizon',
      'Priority queue + analytics',
    ],
    badge: 'Best Value',
    recommended: false,
  },
} satisfies Record<string, TierConfig>;

export type TierKey = keyof typeof PRICING_TIERS;
export type PricingTier = (typeof PRICING_TIERS)[TierKey];
