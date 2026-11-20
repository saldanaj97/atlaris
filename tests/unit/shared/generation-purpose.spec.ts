import {
  describeGenerationPurpose,
  GENERATION_PURPOSES,
  isGenerationPurpose,
  parseGenerationPurpose,
  resolveWorkflowGenerationPurpose,
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
    expect(resolveWorkflowGenerationPurpose(undefined, 'initial')).toBe(
      'initial',
    );
    expect(resolveWorkflowGenerationPurpose(undefined, 'regeneration')).toBe(
      'regeneration',
    );
    expect(resolveWorkflowGenerationPurpose('initial', 'regeneration')).toBe(
      'initial',
    );
    expect(() => resolveWorkflowGenerationPurpose('retry', 'initial')).toThrow(
      /Invalid generation purpose/,
    );
  });

  it('keeps describeGenerationPurpose exhaustive', () => {
    const purpose: GenerationPurpose = 'initial';
    expect(describeGenerationPurpose(purpose)).toBe('initial');
    expect(describeGenerationPurpose('regeneration')).toBe('regeneration');
  });
});
