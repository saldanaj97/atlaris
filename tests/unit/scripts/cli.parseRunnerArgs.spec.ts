import { describe, expect, it } from 'vitest';
import { parseRunnerArgs } from '../../../scripts/tests/shared/cli';

describe('parseRunnerArgs', () => {
  it('uses default path when argv empty', () => {
    expect(parseRunnerArgs([], { defaultTestPath: 'tests/unit' })).toEqual({
      testPath: 'tests/unit',
      watch: false,
      changed: false,
      helpRequested: false,
      extraArgs: [],
    });
  });

  it('uses first non-flag as test path', () => {
    expect(
      parseRunnerArgs(['tests/foo.spec.ts', '--watch', '--unknown'], {
        defaultTestPath: 'tests/unit',
      }),
    ).toEqual({
      testPath: 'tests/foo.spec.ts',
      watch: true,
      changed: false,
      helpRequested: false,
      extraArgs: ['--unknown'],
    });
  });

  it('collects watch, changed, help', () => {
    expect(
      parseRunnerArgs(['-w', '-c', '-h'], { defaultTestPath: 'x' }),
    ).toEqual({
      testPath: 'x',
      watch: true,
      changed: true,
      helpRequested: true,
      extraArgs: [],
    });
  });
});
