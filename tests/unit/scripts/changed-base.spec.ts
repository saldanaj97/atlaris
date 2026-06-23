import { resolveChangedTestBase } from '../../../scripts/tests/changed-base';
import { describe, expect, it } from 'vitest';

describe('resolveChangedTestBase', () => {
  it('defaults changed tests to origin/develop when no base env is configured', () => {
    expect(resolveChangedTestBase({})).toBe('origin/develop');
  });

  it('uses VITEST_CHANGED_BASE when provided', () => {
    expect(
      resolveChangedTestBase({ VITEST_CHANGED_BASE: 'origin/develop' }),
    ).toBe('origin/develop');
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
