import { resolvePlanRegenerationWorkflowPurpose } from '@/features/plans/workflows/plan-regeneration.types';
import { describe, expect, it } from 'vitest';

describe('plan regeneration workflow purpose', () => {
  it('classifies regeneration workflow payloads as regeneration', () => {
    expect(
      resolvePlanRegenerationWorkflowPurpose({
        generationPurpose: 'regeneration',
      }),
    ).toBe('regeneration');
  });

  it('resolves already-enqueued payloads missing purpose to regeneration once', () => {
    expect(resolvePlanRegenerationWorkflowPurpose({})).toBe('regeneration');
  });

  it('rejects invalid purpose values instead of inferring', () => {
    expect(() =>
      resolvePlanRegenerationWorkflowPurpose({
        generationPurpose: 'retry' as unknown as 'regeneration',
      }),
    ).toThrow(/Invalid generation purpose/);
  });
});
