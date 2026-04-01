import { getPlanForPage } from '@/app/plans/[id]/actions';
import type { PlanAccessResult } from '@/app/plans/[id]/types';

/**
 * Loads plan detail for the page. Not wrapped in `cache()` — auth-gated data
 * must not be memoized by `planId` alone across different users/sessions.
 */
export async function loadPlanForPage(
  planId: string,
  deps?: { getPlanForPage: typeof getPlanForPage }
): Promise<PlanAccessResult> {
  const load = deps?.getPlanForPage ?? getPlanForPage;
  return load(planId);
}
