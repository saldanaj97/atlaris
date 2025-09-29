import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import PlanDetailPageError from '@/components/plans/Error';
import PlanDetails from '@/components/plans/PlanDetails';
import { PlanPendingState } from '@/components/plans/PlanPendingState';
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

  // Check plan status (when status field is added in Phase 5)
  // @ts-expect-error - status field will be added in Phase 5
  const planStatus = plan.plan.status as
    | 'pending'
    | 'generating'
    | 'failed'
    | 'ready'
    | undefined;

  // Handle pending, generating, or failed states
  if (planStatus === 'pending' || planStatus === 'generating') {
    return <PlanPendingState planId={id} status={planStatus} />;
  }

  if (planStatus === 'failed') {
    // @ts-expect-error - error fields will be added in Phase 5
    const errorMessage = plan.plan.errorMessage as string | undefined;
    // @ts-expect-error - error fields will be added in Phase 5
    const errorCode = plan.plan.errorCode as string | undefined;

    return (
      <PlanPendingState
        planId={id}
        status="failed"
        errorMessage={errorMessage}
        errorCode={errorCode}
      />
    );
  }

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
