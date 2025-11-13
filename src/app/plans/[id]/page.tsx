import PlanDetailPageError from '@/components/plans/Error';
import PlanDetails from '@/components/plans/PlanDetails';
import {
  getPlanForPage,
  getPlanScheduleForPage,
} from '@/app/plans/[id]/actions';
import { mapDetailToClient } from '@/lib/mappers/detailToClient';
import { logger } from '@/lib/logging/logger';
import { redirect } from 'next/navigation';

interface PlanPageProps {
  params: { id: string };
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

  // Fetch plan data using server action (RLS-enforced via getDb())
  let plan;
  try {
    plan = await getPlanForPage(id);
  } catch (error) {
    logger.error(
      {
        planId: id,
        error,
      },
      'Failed to fetch plan'
    );
    redirect(`/sign-in?redirect_url=/plans/${id}`);
  }

  if (!plan) redirect(`/sign-in?redirect_url=/plans/${id}`);

  const formattedPlanDetails = mapDetailToClient(plan);
  if (!formattedPlanDetails) return <PlanDetailPageError />;

  // Fetch schedule with error handling using server action
  let schedule;
  try {
    schedule = await getPlanScheduleForPage(id);
  } catch (error) {
    logger.error(
      {
        planId: id,
        error,
      },
      'Failed to fetch plan schedule'
    );
    // Show error UI to inform the user that schedule failed to load
    return <PlanDetailPageError message="Failed to load schedule." />;
  }

  return <PlanDetails plan={formattedPlanDetails} schedule={schedule} />;
}
