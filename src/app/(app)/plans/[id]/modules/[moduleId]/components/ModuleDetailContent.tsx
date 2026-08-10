import { ModuleDetailPageError } from './Error';
import { ModuleDetail } from './ModuleDetail';
import { ModuleDetailContentSkeleton } from './ModuleDetailContentSkeleton';
import {
  getModuleError,
  isModuleSuccess,
} from '@/app/(app)/plans/[id]/modules/[moduleId]/helpers';
import { loadModuleForPage } from '@/app/(app)/plans/[id]/modules/[moduleId]/module-page-data';
import { ROUTES } from '@/features/navigation/routes';
import { logger } from '@/lib/logging/logger';
import { redirect } from 'next/navigation';

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
        // Module doesn't exist or user doesn't have access
        return (
          <ModuleDetailPageError
            message='This module does not exist or you do not have access to it.'
            planId={planId}
          />
        );

      case 'FORBIDDEN':
        // User is authenticated but explicitly not allowed
        return (
          <ModuleDetailPageError
            message='You do not have permission to view this module.'
            planId={planId}
          />
        );
      default:
        // Unexpected error - show generic message
        return (
          <ModuleDetailPageError
            message='Something went wrong. Please try again later.'
            planId={planId}
          />
        );
    }
  }

  return <ModuleDetail moduleData={moduleResult.data} />;
}
