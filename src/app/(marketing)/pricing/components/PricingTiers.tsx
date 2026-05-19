import {
  formatMarketingLimit,
  formatMarketingSchedulingHorizon,
} from '@/app/_shared/usage-formatting';
import { TIER_LIMITS } from '@/shared/constants/tier-limits';
import type { SubscriptionTier } from '@/shared/types/billing.types';

interface PricingTierDisplay {
  name: string;
  price: string | null;
  description: string;
  features: string[];
  badge: string;
  recommended: boolean;
}

export const PRICING_TIERS: Record<SubscriptionTier, PricingTierDisplay> = {
  free: {
    name: 'Free',
    price: '$0',
    description: 'Get started with structured learning plans.',
    features: [
      `${formatMarketingLimit(TIER_LIMITS.free.maxActivePlans)} active learning plans`,
      `${formatMarketingLimit(TIER_LIMITS.free.monthlyRegenerations)} plan regenerations per month`,
      `${formatMarketingLimit(TIER_LIMITS.free.monthlyExports)} exports per month`,
      `${formatMarketingSchedulingHorizon(TIER_LIMITS.free.maxWeeks)} scheduling horizon`,
    ],
    badge: 'Free',
    recommended: false,
  },
  starter: {
    name: 'Starter',
    price: null,
    description: 'For dedicated learners ready to go further.',
    features: [
      `${formatMarketingLimit(TIER_LIMITS.starter.maxActivePlans)} active learning plans`,
      `${formatMarketingLimit(TIER_LIMITS.starter.monthlyRegenerations)} plan regenerations per month`,
      `${formatMarketingLimit(TIER_LIMITS.starter.monthlyExports)} exports per month`,
      `${formatMarketingSchedulingHorizon(TIER_LIMITS.starter.maxWeeks)} scheduling horizon`,
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
      `${formatMarketingLimit(TIER_LIMITS.pro.maxActivePlans)} active plans`,
      `${formatMarketingLimit(TIER_LIMITS.pro.monthlyRegenerations)} plan regenerations per month`,
      `${formatMarketingLimit(TIER_LIMITS.pro.monthlyExports)} exports`,
      `${formatMarketingSchedulingHorizon(TIER_LIMITS.pro.maxWeeks)} scheduling horizon`,
      'Priority queue + analytics',
    ],
    badge: 'Best Value',
    recommended: false,
  },
};
