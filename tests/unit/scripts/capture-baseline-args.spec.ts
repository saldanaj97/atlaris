import { describe, expect, it } from 'vitest';
import {
  parseCaptureBaselineArgs,
  stripLeadingDoubleDash,
} from '../../../scripts/ui/capture-baseline-args';

describe('stripLeadingDoubleDash', () => {
  it('strips leading --', () => {
    expect(stripLeadingDoubleDash(['--', 'a', 'b'])).toEqual(['a', 'b']);
    expect(stripLeadingDoubleDash(['a'])).toEqual(['a']);
  });
});

describe('parseCaptureBaselineArgs', () => {
  it('parses help and bases', () => {
    expect(
      parseCaptureBaselineArgs([
        '--help',
        '--out=/tmp/x',
        '--anon-base=https://a/',
        '--auth-base=https://b/',
      ]),
    ).toEqual({
      outDir: '/tmp/x',
      anonBase: 'https://a',
      authBase: 'https://b',
      help: true,
    });
  });
});
