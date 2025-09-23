import { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import {
  learningStyle,
  progressStatus,
  resourceType,
  skillLevel,
} from '@/lib/db/enums';
import {
  learningPlans,
  modules,
  resources,
  taskProgress,
  taskResources,
  tasks,
} from '@/lib/db/schema';

export const SKILL_LEVELS = skillLevel.enumValues;
export const LEARNING_STYLES = learningStyle.enumValues;
export const RESOURCE_TYPES = resourceType.enumValues;
export const PROGRESS_STATUSES = progressStatus.enumValues;

export type SkillLevel = (typeof SKILL_LEVELS)[number];
export type LearningStyle = (typeof LEARNING_STYLES)[number];
export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

export type LearningPlan = InferSelectModel<typeof learningPlans>;
export type NewLearningPlan = InferInsertModel<typeof learningPlans>;

export type Module = InferSelectModel<typeof modules>;
export type Task = InferSelectModel<typeof tasks>;
export type Resource = InferSelectModel<typeof resources>;
export type TaskResource = InferSelectModel<typeof taskResources>;
export type TaskProgress = InferSelectModel<typeof taskProgress>;

export interface TaskResourceWithResource extends TaskResource {
  resource: Resource;
}

export interface TaskWithRelations extends Task {
  resources: TaskResourceWithResource[];
  progress?: TaskProgress | null;
}

export interface ModuleWithRelations extends Module {
  tasks: TaskWithRelations[];
}

export interface LearningPlanWithRelations extends LearningPlan {
  modules: ModuleWithRelations[];
}

export interface PlanSummary {
  plan: LearningPlan;
  completion: number;
  completedTasks: number;
  totalTasks: number;
  totalMinutes: number;
  completedMinutes: number;
  modules: Module[];
  completedModules: number;
}

export interface LearningPlanDetail {
  plan: LearningPlanWithRelations;
  totalTasks: number;
  completedTasks: number;
}
