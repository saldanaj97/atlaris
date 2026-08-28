import type { DeadlineWeeks } from './plan-input-state';
import type { DropdownOption } from './types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { DEADLINE_OPTIONS } from './constants';
import { CUSTOM_DEADLINE_VALUE } from '@/features/plans/plan-form-payload';
import { TIER_LIMITS } from '@/shared/constants/tier-limits';

export { CUSTOM_DEADLINE_VALUE };

export function isDeadlinePresetEnabled(
  tier: SubscriptionTier,
  weeks: number,
): boolean {
  const maxWeeks = TIER_LIMITS[tier].maxWeeks;
  return maxWeeks === null || weeks <= maxWeeks;
}

export function deadlinePresetUpgradeCopy(
  tier: SubscriptionTier,
): string | undefined {
  switch (tier) {
    case 'free':
      return 'Upgrade to Starter for longer plans';
    case 'starter':
      return 'Upgrade to Pro for longer plans';
    case 'pro':
      return undefined;
    default: {
      const _never: never = tier;
      return _never;
    }
  }
}

export function isSelectedDeadlineAllowedForTier(
  tier: SubscriptionTier,
  deadlineWeeks: string | null,
): boolean {
  if (deadlineWeeks === null) {
    return true;
  }
  if (deadlineWeeks === CUSTOM_DEADLINE_VALUE) {
    return tier === 'pro';
  }
  const weeks = Number.parseInt(deadlineWeeks, 10);
  if (!Number.isFinite(weeks)) {
    return false;
  }
  return isDeadlinePresetEnabled(tier, weeks);
}

export function buildDeadlineOptionsForTier(
  tier: SubscriptionTier,
): readonly DropdownOption<DeadlineWeeks>[] {
  const upgradeCopy = deadlinePresetUpgradeCopy(tier);
  const presets: DropdownOption<DeadlineWeeks>[] = DEADLINE_OPTIONS.map(
    (option) => {
      const weeks = Number.parseInt(option.value, 10);
      const enabled = isDeadlinePresetEnabled(tier, weeks);
      return {
        value: option.value,
        label: option.label,
        ...(enabled
          ? {}
          : {
              disabled: true,
              ...(upgradeCopy !== undefined
                ? { description: upgradeCopy }
                : {}),
            }),
      };
    },
  );

  if (tier === 'pro') {
    return [...presets, { value: CUSTOM_DEADLINE_VALUE, label: 'Custom date' }];
  }

  return presets;
}
