import { isUnlimitedNumber } from '@/app/(app)/plans/components/usage-types';
import { TIER_LIMITS } from '@/shared/constants/tier-limits';
import type { SubscriptionTier } from '@/shared/types/billing.types';

interface TierConfig {
  name: string;
  price: string | null;
  description: string;
  features: string[];
  badge: string;
  recommended: boolean;
}

function formatTierLimit(value: number | null): string {
  return isUnlimitedNumber(value) ? 'Unlimited' : String(value);
}

function formatSchedulingHorizon(value: number | null): string {
  return isUnlimitedNumber(value) ? 'Unlimited' : `${value}-week`;
}

export const PRICING_TIERS: Record<SubscriptionTier, TierConfig> = {
  free: {
    name: 'Free',
    price: '$0',
    description: 'Get started with structured learning plans.',
    features: [
      `${formatTierLimit(TIER_LIMITS.free.maxActivePlans)} active learning plans`,
      `${formatTierLimit(TIER_LIMITS.free.monthlyRegenerations)} plan regenerations per month`,
      `${formatTierLimit(TIER_LIMITS.free.monthlyExports)} exports per month`,
      `${formatSchedulingHorizon(TIER_LIMITS.free.maxWeeks)} scheduling horizon`,
    ],
    badge: 'Free',
    recommended: false,
  },
  starter: {
    name: 'Starter',
    price: null,
    description: 'For dedicated learners ready to go further.',
    features: [
      `${formatTierLimit(TIER_LIMITS.starter.maxActivePlans)} active learning plans`,
      `${formatTierLimit(TIER_LIMITS.starter.monthlyRegenerations)} plan regenerations per month`,
      `${formatTierLimit(TIER_LIMITS.starter.monthlyExports)} exports per month`,
      `${formatSchedulingHorizon(TIER_LIMITS.starter.maxWeeks)} scheduling horizon`,
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
      `${formatTierLimit(TIER_LIMITS.pro.maxActivePlans)} active plans`,
      `${formatTierLimit(TIER_LIMITS.pro.monthlyRegenerations)} plan regenerations per month`,
      `${formatTierLimit(TIER_LIMITS.pro.monthlyExports)} exports`,
      `${formatSchedulingHorizon(TIER_LIMITS.pro.maxWeeks)} scheduling horizon`,
      'Priority queue + analytics',
    ],
    badge: 'Best Value',
    recommended: false,
  },
};
