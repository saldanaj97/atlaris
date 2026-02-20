import { cache } from 'react';

import { getModuleForPage } from '@/app/plans/[id]/modules/[moduleId]/actions';
import type { ModuleAccessResult } from '@/app/plans/[id]/modules/[moduleId]/types';

export const getCachedModuleForPage = cache(
  async (moduleId: string): Promise<ModuleAccessResult> =>
    getModuleForPage(moduleId)
);
