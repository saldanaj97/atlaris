import { resolveChangedTestBase } from '../../../scripts/tests/changed-base';
import { describe, expect, it } from 'vitest';

describe('resolveChangedTestBase', () => {
  it('defaults changed tests to origin/develop when no base env is configured', () => {
    expect(resolveChangedTestBase({})).toBe('origin/develop');
  });

  it('prefers VITEST_CHANGED_BASE over BASE_REF', () => {
    expect(
      resolveChangedTestBase({
        BASE_REF: 'develop',
        VITEST_CHANGED_BASE: 'origin/release',
      }),
    ).toBe('origin/release');
  });

  it('falls back to BASE_REF for GitHub-style environments', () => {
    expect(resolveChangedTestBase({ BASE_REF: 'develop' })).toBe('develop');
  });

  it('ignores blank env values', () => {
    expect(
      resolveChangedTestBase({
        BASE_REF: '  main  ',
        VITEST_CHANGED_BASE: '  ',
      }),
    ).toBe('main');
  });
});
