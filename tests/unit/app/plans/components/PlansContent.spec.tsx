import { shouldShowPlansLibraryChrome } from '@/app/(app)/plans/components/plans-library-chrome';
import { describe, expect, it } from 'vitest';

describe('shouldShowPlansLibraryChrome', () => {
  it('hides chrome for first-run empty libraries', () => {
    expect(
      shouldShowPlansLibraryChrome(
        { totalSearchResults: 0 },
        { search: '', status: 'all' },
      ),
    ).toBe(false);
  });

  it('hides chrome when Free-plan selection is required', () => {
    expect(
      shouldShowPlansLibraryChrome(
        { selectionRequired: true, totalSearchResults: 4 },
        { search: '', status: 'all' },
      ),
    ).toBe(false);
  });

  it('keeps chrome for filtered empty results', () => {
    expect(
      shouldShowPlansLibraryChrome(
        { totalSearchResults: 0 },
        { search: 'react', status: 'all' },
      ),
    ).toBe(true);
    expect(
      shouldShowPlansLibraryChrome(
        { totalSearchResults: 0 },
        { search: '', status: 'completed' },
      ),
    ).toBe(true);
  });
});
