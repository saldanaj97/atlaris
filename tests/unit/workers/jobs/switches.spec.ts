import {
  isJobEnabled,
  isJobsPaused,
} from '../../../../workers/jobs/src/switches';
import { describe, expect, it } from 'vitest';

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
