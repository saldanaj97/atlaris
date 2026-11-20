import { GENERATION_PURPOSES } from '@/shared/types/generation-purpose';
import { generationPurpose } from '@supabase/enums';
import { describe, expect, it } from 'vitest';

describe('canonical generation attempt purpose schema', () => {
  it('keeps the generation_purpose DB enum in sync with the shared purposes', () => {
    expect(generationPurpose.enumValues).toEqual(GENERATION_PURPOSES);
  });
});
