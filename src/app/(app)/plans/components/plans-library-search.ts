import type { RefObject } from 'react';

export const PLANS_LIBRARY_SEARCH_ID = 'plans-library-search';

/** Shared focus target for library search after bulk-delete and empty-state return. */
export const plansLibrarySearchFocusRef: RefObject<HTMLInputElement | null> = {
  current: null,
};
