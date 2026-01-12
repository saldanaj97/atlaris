import { getModuleForPage } from '@/app/plans/[id]/modules/[moduleId]/actions';
import { ModuleDetailPageError } from '@/app/plans/[id]/modules/[moduleId]/components/Error';
import { ModuleDetail } from '@/app/plans/[id]/modules/[moduleId]/components/ModuleDetail';
import {
  getModuleError,
  isModuleSuccess,
} from '@/app/plans/[id]/modules/[moduleId]/helpers';
import { logger } from '@/lib/logging/logger';
import { redirect } from 'next/navigation';

interface ModulePageProps {
  params: Promise<{ id: string; moduleId: string }>;
}

/**
 * Renders the module detail page for a given module id within a plan.
 *
 * @param params - Route parameters containing the `id` (plan) and `moduleId` of the module to load
 * @returns The page UI: `ModuleDetail` with the module data on success, or `ModuleDetailPageError` when required data cannot be loaded
 */
export default async function ModuleDetailPage({ params }: ModulePageProps) {
  const { id: planId, moduleId } = await params;

  if (!moduleId) {
    return <ModuleDetailPageError planId={planId} />;
  }

  const moduleResult = await getModuleForPage(moduleId);

  // Handle module access errors with explicit error codes
  if (!isModuleSuccess(moduleResult)) {
    const error = getModuleError(moduleResult);
    const code = error.code;
    const message = error.message;

    logger.warn(
      { moduleId, planId, errorCode: code },
      `Module access denied: ${message}`
    );

    switch (code) {
      case 'UNAUTHORIZED':
        // User needs to authenticate - redirect to sign-in
        // redirect() throws and never returns
        redirect(`/sign-in?redirect_url=/plans/${planId}/modules/${moduleId}`);
        // This line is unreachable but satisfies TypeScript's exhaustive check
        break;

      case 'NOT_FOUND':
        // Module doesn't exist or user doesn't have access
        return (
          <ModuleDetailPageError
            message="This module does not exist or you do not have access to it."
            planId={planId}
          />
        );

      case 'FORBIDDEN':
        // User is authenticated but explicitly not allowed
        return (
          <ModuleDetailPageError
            message="You do not have permission to view this module."
            planId={planId}
          />
        );

      case 'INTERNAL_ERROR':
      default:
        // Unexpected error - show generic message
        return (
          <ModuleDetailPageError
            message="Something went wrong. Please try again later."
            planId={planId}
          />
        );
    }
  }

  // TypeScript now knows moduleResult.success is true, so data exists
  return <ModuleDetail moduleData={moduleResult.data} />;
}
