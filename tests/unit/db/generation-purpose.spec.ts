import { GENERATION_PURPOSES } from '@/shared/types/generation-purpose';
import { generationPurpose } from '@supabase/enums';
import { generationAttempts } from '@supabase/schema';
import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

describe('canonical generation attempt purpose schema', () => {
  it('exposes a non-null queryable generation_purpose column', () => {
    const columns = getTableColumns(generationAttempts);

    expect(columns.generationPurpose.name).toBe('generation_purpose');
    expect(columns.generationPurpose.notNull).toBe(true);
    expect(columns.generationPurpose.hasDefault).toBe(true);
  });

  it('uses the two-value generation_purpose enum', () => {
    expect(generationPurpose.enumValues).toEqual(GENERATION_PURPOSES);
    expect(generationPurpose.enumValues).toEqual(['initial', 'regeneration']);
  });
});
