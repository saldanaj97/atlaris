import { getModuleForPage } from '@/app/plans/[id]/modules/[moduleId]/actions';
import type { ModuleAccessResult } from '@/app/plans/[id]/modules/[moduleId]/types';

/**
 * Loads module detail for the page. Not wrapped in `cache()` — auth-gated data
 * must not be memoized by `moduleId` alone across different users/sessions.
 */
export async function loadModuleForPage(
  moduleId: string,
  deps?: { getModuleForPage: typeof getModuleForPage }
): Promise<ModuleAccessResult> {
  const load = deps?.getModuleForPage ?? getModuleForPage;
  return load(moduleId);
}
