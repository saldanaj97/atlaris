import { ClientPlanDetail } from '@/lib/types/client';
import { LearningPlanDetail } from '../types/db';

export function mapDetailToClient(
  detail: LearningPlanDetail
): ClientPlanDetail | undefined {
  if (!detail) return undefined;

  const { plan } = detail;
  if (!plan) return undefined;

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
