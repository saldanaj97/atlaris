import { ModuleDetailPageError } from './Error';
import { ModuleDetail } from './ModuleDetail';
import { ModuleDetailContentSkeleton } from './ModuleDetailContentSkeleton';
import {
  getModuleError,
  isModuleSuccess,
} from '@/app/(app)/plans/[id]/modules/[moduleId]/helpers';
import { loadModuleForPage } from '@/app/(app)/plans/[id]/modules/[moduleId]/module-page-data';
import { FreeAccessPlanSelector } from '@/app/(app)/plans/components/FreeAccessPlanSelector';
import { ROUTES } from '@/features/navigation/routes';
import { logger } from '@/lib/logging/logger';
import { notFound, redirect } from 'next/navigation';

export { ModuleDetailContentSkeleton };

interface ModuleDetailContentProps {
  planId: string;
  moduleId: string;
}

/**
 * Async component that fetches module data and renders the appropriate view.
 * Wrapped in Suspense boundary by the parent page.
 */
export async function ModuleDetailContent({
  planId,
  moduleId,
}: ModuleDetailContentProps) {
  const moduleResult = await loadModuleForPage(planId, moduleId);

  if (!isModuleSuccess(moduleResult)) {
    const error = getModuleError(moduleResult);
    const code = error.code;
    const message = error.message;

    logger.warn(
      { moduleId, planId, errorCode: code },
      `Module access denied: ${message}`,
    );

    switch (code) {
      case 'UNAUTHORIZED': {
        const redirectPath = `/plans/${planId}/modules/${moduleId}`;
        return redirect(
          `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(redirectPath)}`,
        );
      }

      case 'NOT_FOUND':
        // Missing and not-owned modules share this code; render the module-scoped not-found UI.
        // This runs after streaming starts, so the response stays 200 with a noindex
        // tag (a soft 404). Accepted because these pages sit behind auth; a real 404
        // would need a pre-stream check in proxy.
        return notFound();

      case 'FORBIDDEN':
        return (
          <ModuleDetailPageError
            message='You do not have permission to view this module.'
            planId={planId}
          />
        );

      case 'PLAN_ENTITLEMENT_REQUIRED':
        return (
          <ModuleDetailPageError
            message='Upgrade to access this plan.'
            planId={planId}
            upgradeHref={ROUTES.PRICING}
          />
        );

      case 'FREE_PLAN_SELECTION_REQUIRED':
        return (
          <div className='mx-auto max-w-2xl py-10'>
            <FreeAccessPlanSelector candidates={error.candidates ?? []} />
          </div>
        );

      case 'INTERNAL_ERROR':
        return (
          <ModuleDetailPageError
            message='Something went wrong. Please try again later.'
            planId={planId}
          />
        );

      default: {
        const _exhaustive: never = code;
        return (
          <ModuleDetailPageError
            message='Something went wrong. Please try again later.'
            planId={planId}
          />
        );
      }
    }
  }

  return <ModuleDetail moduleData={moduleResult.data} />;
}
