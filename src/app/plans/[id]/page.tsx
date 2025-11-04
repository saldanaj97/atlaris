import PlanDetailPageError from '@/components/plans/Error';
import PlanDetails from '@/components/plans/PlanDetails';
import { getEffectiveClerkUserId } from '@/lib/api/auth';
import { getPlanSchedule } from '@/lib/api/schedule';
import { getLearningPlanDetail } from '@/lib/db/queries/plans';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { mapDetailToClient } from '@/lib/mappers/detailToClient';
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

  const userId = await getEffectiveClerkUserId();
  if (!userId) redirect(`/sign-in?redirect_url=/plans/${id}`);

  const user = await getUserByClerkId(userId);
  if (!user) redirect(`/sign-in?redirect_url=/plans/${id}`);

  const plan = await getLearningPlanDetail(id, user.id);
  if (!plan) redirect(`/sign-in?redirect_url=/plans/${id}`);

  const formattedPlanDetails = mapDetailToClient(plan);
  if (!formattedPlanDetails) return <PlanDetailPageError />;

  // Fetch schedule with error handling
  let schedule;
  try {
    schedule = await getPlanSchedule({ planId: id, userId: user.id });
  } catch (error) {
    console.error('Failed to fetch schedule:', {
      planId: id,
      userId: user.id,
      error,
    });
    // Show error UI to inform the user that schedule failed to load
    return <PlanDetailPageError message="Failed to load schedule." />;
  }

  return <PlanDetails plan={formattedPlanDetails} schedule={schedule} />;
}
