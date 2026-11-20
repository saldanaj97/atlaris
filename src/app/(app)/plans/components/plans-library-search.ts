import type { RefObject } from 'react';

export const PLANS_LIBRARY_SEARCH_ID = 'plans-library-search';

export const plansLibrarySearchFocusRef: RefObject<HTMLInputElement | null> = {
  current: null,
};
