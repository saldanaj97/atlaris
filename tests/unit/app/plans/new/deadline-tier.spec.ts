import {
  buildDeadlineOptionsForTier,
  CUSTOM_DEADLINE_VALUE,
  isDeadlinePresetEnabled,
  isSelectedDeadlineAllowedForTier,
} from '@/app/(app)/plans/new/components/plan-form/deadline-tier';
import { describe, expect, it } from 'vitest';

describe('deadline options for actor tier', () => {
  it('enables only 2 weeks on Free and disables longer presets', () => {
    expect(isDeadlinePresetEnabled('free', 2)).toBe(true);
    expect(isDeadlinePresetEnabled('free', 4)).toBe(false);
    const options = buildDeadlineOptionsForTier('free');
    expect(
      options.find((option) => option.value === '2')?.disabled,
    ).toBeUndefined();
    expect(options.find((option) => option.value === '4')?.disabled).toBe(true);
    expect(options.find((option) => option.value === '8')?.description).toMatch(
      /Upgrade to Starter/,
    );
    expect(
      options.some((option) => option.value === CUSTOM_DEADLINE_VALUE),
    ).toBe(false);
  });

  it('enables 2/4/8 on Starter and disables longer presets', () => {
    expect(isDeadlinePresetEnabled('starter', 8)).toBe(true);
    expect(isDeadlinePresetEnabled('starter', 12)).toBe(false);
    const options = buildDeadlineOptionsForTier('starter');
    expect(
      options.find((option) => option.value === '8')?.disabled,
    ).toBeUndefined();
    expect(options.find((option) => option.value === '12')?.disabled).toBe(
      true,
    );
    expect(
      options.find((option) => option.value === '12')?.description,
    ).toMatch(/Upgrade to Pro/);
  });

  it('enables all presets plus custom on Pro', () => {
    const options = buildDeadlineOptionsForTier('pro');
    expect(options.every((option) => !option.disabled)).toBe(true);
    expect(
      options.some((option) => option.value === CUSTOM_DEADLINE_VALUE),
    ).toBe(true);
    expect(isSelectedDeadlineAllowedForTier('pro', CUSTOM_DEADLINE_VALUE)).toBe(
      true,
    );
    expect(
      isSelectedDeadlineAllowedForTier('starter', CUSTOM_DEADLINE_VALUE),
    ).toBe(false);
    expect(isSelectedDeadlineAllowedForTier('free', '12')).toBe(false);
  });
});
