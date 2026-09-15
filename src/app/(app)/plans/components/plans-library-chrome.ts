import type { PlanListQuery } from '@/features/plans/read-projection/types';

export function shouldShowPlansLibraryChrome(
  plansPage: {
    selectionRequired?: boolean;
    totalSearchResults: number;
  },
  query: Pick<PlanListQuery, 'search' | 'status'>,
): boolean {
  if (plansPage.selectionRequired) return false;
  return !(
    plansPage.totalSearchResults === 0 &&
    query.search === '' &&
    query.status === 'all'
  );
}
