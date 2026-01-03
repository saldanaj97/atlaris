import {
  getPlanForPage,
  getPlanScheduleForPage,
} from '@/app/plans/[id]/actions';
import {
  getPlanError,
  getScheduleError,
  isPlanSuccess,
  isScheduleSuccess,
} from '@/app/plans/[id]/helpers';
import PlanDetailPageError from '@/app/plans/components/Error';
import PlanDetails from '@/app/plans/components/PlanDetails';
import { logger } from '@/lib/logging/logger';
import { mapDetailToClient } from '@/lib/mappers/detailToClient';
import type { ScheduleJson } from '@/lib/scheduling/types';
import { redirect } from 'next/navigation';

interface PlanPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Renders the plan detail page for a given plan id, including its schedule or an error UI.
 *
 * @param params - Route parameters containing the `id` of the learning plan to load
 * @returns The page UI: `PlanDetails` with the mapped plan and its schedule on success, or `PlanDetailPageError` when required data or schedule cannot be loaded
 */
export default async function PlanDetailPage({ params }: PlanPageProps) {
  const { id } = await params;
  if (!id) return <PlanDetailPageError />;

  // Fetch plan and schedule in parallel to avoid waterfalls
  const [planResult, scheduleResult] = await Promise.all([
    getPlanForPage(id),
    getPlanScheduleForPage(id),
  ]);

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

  // Handle schedule access errors - show plan with degraded schedule
  let scheduleData: ScheduleJson | null = null;
  let scheduleErrorMsg: string | undefined;

  if (!isScheduleSuccess(scheduleResult)) {
    const error = getScheduleError(scheduleResult);
    const code = error.code;
    const message = error.message;

    logger.warn(
      { planId: id, errorCode: code },
      `Schedule access denied: ${message}`
    );

    // For schedule errors, if it's an auth error we should redirect
    // (shouldn't happen if plan succeeded, but handle it anyway)
    if (code === 'UNAUTHORIZED') {
      redirect(`/sign-in?redirect_url=/plans/${id}`);
    }

    // Set error message for degraded display
    scheduleErrorMsg = 'Failed to load schedule. Please try again later.';
  } else {
    scheduleData = scheduleResult.data;
  }

  return (
    <PlanDetails
      plan={formattedPlanDetails}
      schedule={scheduleData}
      scheduleError={scheduleErrorMsg}
    />
  );
}
