import { getPlanForPage } from '@/app/plans/[id]/actions';
import { PlanDetailPageError } from '@/app/plans/[id]/components/Error';
import { PlanDetails } from '@/app/plans/[id]/components/PlanDetails';
import { getPlanError, isPlanSuccess } from '@/app/plans/[id]/helpers';
import { logger } from '@/lib/logging/logger';
import { mapDetailToClient } from '@/lib/mappers/detailToClient';
import { redirect } from 'next/navigation';

interface PlanPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Renders the plan detail page for a given plan id.
 *
 * @param params - Route parameters containing the `id` of the learning plan to load
 * @returns The page UI: `PlanDetails` with the mapped plan on success, or `PlanDetailPageError` when required data cannot be loaded
 */
export default async function PlanDetailPage({ params }: PlanPageProps) {
  const { id } = await params;
  if (!id) return <PlanDetailPageError />;

  const planResult = await getPlanForPage(id);

  // Handle plan access errors with explicit error codes
  if (!isPlanSuccess(planResult)) {
    const error = getPlanError(planResult);
    const code = error.code;
    const message = error.message;

    logger.warn(
      { planId: id, errorCode: code },
      `Plan access denied: ${message}`
    );

    switch (code) {
      case 'UNAUTHORIZED':
        // User needs to authenticate - redirect to sign-in
        // redirect() throws and never returns
        redirect(`/sign-in?redirect_url=/plans/${id}`);

      case 'NOT_FOUND':
        // Plan doesn't exist or user doesn't have access
        return (
          <PlanDetailPageError message="This plan does not exist or you do not have access to it." />
        );

      case 'FORBIDDEN':
        // User is authenticated but explicitly not allowed
        return (
          <PlanDetailPageError message="You do not have permission to view this plan." />
        );

      case 'INTERNAL_ERROR':
      default:
        // Unexpected error - show generic message
        return (
          <PlanDetailPageError message="Something went wrong. Please try again later." />
        );
    }
  }

  // TypeScript now knows planResult.success is true, so data exists
  const planData = planResult.data;
  const formattedPlanDetails = mapDetailToClient(planData);
  if (!formattedPlanDetails) {
    logger.error(
      { planId: id, planData },
      'Failed to map plan details to client format'
    );
    return <PlanDetailPageError message="Failed to load plan details." />;
  }

  return <PlanDetails plan={formattedPlanDetails} />;
}
