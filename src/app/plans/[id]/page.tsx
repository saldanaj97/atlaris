import PlanDetailPageError from '@/components/plans/Error';
import PlanDetails from '@/components/plans/PlanDetails';
import { getEffectiveClerkUserId } from '@/lib/api/auth';
import { getLearningPlanDetail, getUserByClerkId } from '@/lib/db/queries';
import { mapDetailToClient } from '@/lib/mappers/detailToClient';
import { redirect } from 'next/navigation';

interface PlanPageProps {
  params: { id: string };
}

export default async function PlanDetailPage({ params }: PlanPageProps) {
  const { id } = await params;
  if (!id) return <PlanDetailPageError />;

  const userId = await getEffectiveClerkUserId();
  if (!userId) redirect(`/sign-in?redirect_url=/plans/${id}`);

  const user = await getUserByClerkId(userId);
  if (!user) redirect(`/sign-in?redirect_url=/plans/${id}`);

  const planDetails = await getLearningPlanDetail(id, user.id);
  if (!planDetails) redirect(`/sign-in?redirect_url=/plans/${id}`);

  const plan = mapDetailToClient(planDetails);
  if (!plan) return <PlanDetailPageError />;

  return <PlanDetails plan={plan} />;
}
