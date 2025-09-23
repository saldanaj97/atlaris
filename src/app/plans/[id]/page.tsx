import { getEffectiveClerkUserId } from '@/lib/api/auth';
import { notFound, redirect } from 'next/navigation';

import PlanDetailClient, {
  type ClientPlanDetail,
} from '@/components/plans/PlanDetailClient';
import { getLearningPlanDetail, getUserByClerkId } from '@/lib/db/queries';
import type { LearningPlanDetail } from '@/lib/types';

interface PlanPageProps {
  params: { id: string };
}

function mapDetailToClient(detail: LearningPlanDetail): ClientPlanDetail {
  const { plan } = detail;
  return {
    id: plan.id,
    topic: plan.topic,
    skillLevel: plan.skillLevel,
    weeklyHours: plan.weeklyHours,
    learningStyle: plan.learningStyle,
    visibility: plan.visibility,
    origin: plan.origin,
    createdAt: plan.createdAt?.toISOString(),
    modules: plan.modules
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((module) => ({
        id: module.id,
        order: module.order,
        title: module.title,
        description: module.description ?? null,
        estimatedMinutes: module.estimatedMinutes,
        tasks: module.tasks
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((task) => ({
            id: task.id,
            order: task.order,
            title: task.title,
            description: task.description ?? null,
            estimatedMinutes: task.estimatedMinutes,
            status: task.progress?.status ?? 'not_started',
            resources: task.resources
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((resource) => ({
                id: resource.id,
                order: resource.order,
                type: resource.resource.type,
                title: resource.resource.title,
                url: resource.resource.url,
                durationMinutes: resource.resource.durationMinutes,
              })),
          })),
      })),
  };
}

export default async function PlanDetailPage({ params }: PlanPageProps) {
  const { id } = await params;
  const userId = await getEffectiveClerkUserId();
  if (!userId) redirect(`/sign-in?redirect_url=/plans/${id}`);

  const user = await getUserByClerkId(userId);
  if (!user) {
    notFound();
  }

  const detail = await getLearningPlanDetail(id, user.id);
  if (!detail) {
    notFound();
  }

  const plan = mapDetailToClient(detail);

  return <PlanDetailClient plan={plan} />;
}
