import { assertNever } from '@/lib/errors';
import {
  describeGenerationPurpose,
  GENERATION_PURPOSES,
  isGenerationPurpose,
  parseGenerationPurpose,
  resolveLegacyWorkflowGenerationPurpose,
  type GenerationPurpose,
} from '@/shared/types/generation-purpose';
import { describe, expect, it } from 'vitest';

describe('generation purpose domain', () => {
  it('exposes exactly initial and regeneration', () => {
    expect(GENERATION_PURPOSES).toEqual(['initial', 'regeneration']);
  });

  it('parses the two canonical values and rejects everything else', () => {
    expect(parseGenerationPurpose('initial')).toBe('initial');
    expect(parseGenerationPurpose('regeneration')).toBe('regeneration');
    expect(isGenerationPurpose('initial')).toBe(true);
    expect(isGenerationPurpose('regeneration')).toBe(true);

    for (const invalid of [
      'retry',
      'plan',
      'INITIAL',
      '',
      1,
      null,
      undefined,
      { purpose: 'initial' },
    ]) {
      expect(isGenerationPurpose(invalid)).toBe(false);
      expect(() => parseGenerationPurpose(invalid)).toThrow(
        /Invalid generation purpose/,
      );
    }
  });

  it('resolves missing workflow payload purpose once at the trusted fallback', () => {
    expect(resolveLegacyWorkflowGenerationPurpose(undefined, 'initial')).toBe(
      'initial',
    );
    expect(
      resolveLegacyWorkflowGenerationPurpose(undefined, 'regeneration'),
    ).toBe('regeneration');
    expect(
      resolveLegacyWorkflowGenerationPurpose('initial', 'regeneration'),
    ).toBe('initial');
    expect(() =>
      resolveLegacyWorkflowGenerationPurpose('retry', 'initial'),
    ).toThrow(/Invalid generation purpose/);
  });

  it('handles every purpose exhaustively', () => {
    const labels = GENERATION_PURPOSES.map((purpose) => {
      switch (purpose) {
        case 'initial':
          return describeGenerationPurpose(purpose);
        case 'regeneration':
          return describeGenerationPurpose(purpose);
        default:
          return assertNever(purpose);
      }
    });

    expect(labels).toEqual(['initial', 'regeneration']);
  });

  it('keeps describeGenerationPurpose exhaustive', () => {
    const purpose: GenerationPurpose = 'initial';
    expect(describeGenerationPurpose(purpose)).toBe('initial');
    expect(describeGenerationPurpose('regeneration')).toBe('regeneration');
  });
});
