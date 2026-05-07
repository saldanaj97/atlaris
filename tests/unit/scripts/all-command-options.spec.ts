import { describe, expect, it } from 'vitest';
import { parseAllCommandOptions } from '../../../scripts/tests/shared/all-command-options';

describe('parseAllCommandOptions', () => {
  it('returns help kind', () => {
    expect(parseAllCommandOptions(['--help'])).toEqual({ kind: 'help' });
    expect(parseAllCommandOptions(['-h'])).toEqual({ kind: 'help' });
  });

  it('parses flags', () => {
    expect(
      parseAllCommandOptions(['--with-e2e', '--skip-lint', '--skip-typecheck']),
    ).toEqual({
      kind: 'ok',
      options: {
        withE2E: true,
        skipLint: true,
        skipTypecheck: true,
      },
    });
  });

  it('rejects unknown args', () => {
    expect(() => parseAllCommandOptions(['--nope'])).toThrow(
      'Unknown argument: --nope',
    );
  });
});
