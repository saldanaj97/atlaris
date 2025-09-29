import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import PlanDetailPageError from '@/components/plans/Error';
import PlanDetails from '@/components/plans/PlanDetails';
import { PlanDetailSkeleton } from '@/components/plans/skeletons/PlanDetailSkeleton';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { getEffectiveClerkUserId } from '@/lib/api/auth';
import { getLearningPlanDetail, getUserByClerkId } from '@/lib/db/queries';
import { mapDetailToClient } from '@/lib/mappers/detailToClient';

interface PlanPageProps {
  params: { id: string };
}

async function PlanDetailContent({ params }: PlanPageProps) {
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

  return <PlanDetails plan={formattedPlanDetails} />;
}

export default function PlanDetailPage({ params }: PlanPageProps) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PlanDetailSkeleton />}>
        <PlanDetailContent params={params} />
      </Suspense>
    </ErrorBoundary>
  );
}
