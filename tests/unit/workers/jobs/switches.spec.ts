import {
  groundedGenerationTiers,
  isDirectResearchEnabled,
  isGroundedGenerationEnabled,
  isJobEnabled,
  isJobsPaused,
} from '../../../../workers/jobs/src/switches';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('isJobsPaused', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['true', true],
    [' TRUE ', true],
    ['1', true],
    ['false', false],
    ['yes', false],
  ])('JOBS_PAUSED=%j → %s', (value, expected) => {
    expect(isJobsPaused({ JOBS_PAUSED: value })).toBe(expected);
  });
});

describe('isJobEnabled', () => {
  it('is off unless the switch is set to true', () => {
    expect(isJobEnabled({}, 'PLAN_CLEANUP')).toBe(false);
    expect(
      isJobEnabled({ JOB_PLAN_CLEANUP_ENABLED: 'false' }, 'PLAN_CLEANUP'),
    ).toBe(false);
    expect(
      isJobEnabled({ JOB_PLAN_CLEANUP_ENABLED: 'true' }, 'PLAN_CLEANUP'),
    ).toBe(true);
  });

  it('reads only the named job switch', () => {
    expect(
      isJobEnabled({ JOB_RETENTION_CLEANUP_ENABLED: 'true' }, 'PLAN_CLEANUP'),
    ).toBe(false);
  });

  it('is off while jobs are paused', () => {
    expect(
      isJobEnabled(
        { JOBS_PAUSED: 'true', JOB_PLAN_CLEANUP_ENABLED: 'true' },
        'PLAN_CLEANUP',
      ),
    ).toBe(false);
  });
});

describe('isGroundedGenerationEnabled', () => {
  it.each(['free', 'starter', 'pro'] as const)(
    'is off for %s while its switch is unset or not true',
    (tier) => {
      expect(isGroundedGenerationEnabled({}, tier)).toBe(false);
      expect(
        isGroundedGenerationEnabled(
          { [`GROUNDED_GENERATION_${tier.toUpperCase()}`]: 'false' },
          tier,
        ),
      ).toBe(false);
      expect(
        isGroundedGenerationEnabled(
          { [`GROUNDED_GENERATION_${tier.toUpperCase()}`]: 'true' },
          tier,
        ),
      ).toBe(true);
    },
  );

  it('reads only the named tier switch', () => {
    const env = { GROUNDED_GENERATION_PRO: 'true' };

    expect(isGroundedGenerationEnabled(env, 'pro')).toBe(true);
    expect(isGroundedGenerationEnabled(env, 'starter')).toBe(false);
    expect(isGroundedGenerationEnabled(env, 'free')).toBe(false);
  });

  it('ignores JOBS_PAUSED, which stops the jobs themselves', () => {
    expect(
      isGroundedGenerationEnabled(
        { GROUNDED_GENERATION_STARTER: 'true', JOBS_PAUSED: 'true' },
        'starter',
      ),
    ).toBe(true);
  });
});

describe('isDirectResearchEnabled (DEV-171)', () => {
  beforeEach(() => {
    vi.stubEnv('PARALLEL_API_KEY', 'parallel-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    [undefined, false],
    ['true', true],
  ])('PARALLEL_DIRECT_RESEARCH=%j → %s', (value, expected) => {
    expect(isDirectResearchEnabled({ PARALLEL_DIRECT_RESEARCH: value })).toBe(
      expected,
    );
  });

  it('stays off without PARALLEL_API_KEY, so research keeps working', () => {
    vi.stubEnv('PARALLEL_API_KEY', '');

    expect(isDirectResearchEnabled({ PARALLEL_DIRECT_RESEARCH: 'true' })).toBe(
      false,
    );
  });
});

describe('groundedGenerationTiers', () => {
  it('lists the tiers whose switch is on', () => {
    expect(groundedGenerationTiers({})).toEqual([]);
    expect(
      groundedGenerationTiers({
        GROUNDED_GENERATION_FREE: 'false',
        GROUNDED_GENERATION_STARTER: 'true',
        GROUNDED_GENERATION_PRO: '1',
      }),
    ).toEqual(['starter', 'pro']);
  });
});
