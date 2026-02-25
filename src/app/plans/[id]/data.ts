import { cache } from 'react';

import { getPlanForPage } from '@/app/plans/[id]/actions';
import type { PlanAccessResult } from '@/app/plans/[id]/types';

export const getCachedPlanForPage = cache(
  async (planId: string): Promise<PlanAccessResult> => getPlanForPage(planId)
);
