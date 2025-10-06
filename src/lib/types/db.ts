import { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import {
  learningStyle,
  progressStatus,
  resourceType,
  skillLevel,
} from '@/lib/db/enums';
import {
  generationAttempts,
  learningPlans,
  modules,
  planGenerations,
  resources,
  taskProgress,
  taskResources,
  tasks,
  users,
} from '@/lib/db/schema';

// Enum values
export const SKILL_LEVELS = skillLevel.enumValues;
export const LEARNING_STYLES = learningStyle.enumValues;
export const RESOURCE_TYPES = resourceType.enumValues;
export const PROGRESS_STATUSES = progressStatus.enumValues;

// Enum types
export type SkillLevel = (typeof SKILL_LEVELS)[number];
export type LearningStyle = (typeof LEARNING_STYLES)[number];
export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

// Insert types (for creating new records)
export type NewUser = InferInsertModel<typeof users>;
export type NewLearningPlan = InferInsertModel<typeof learningPlans>;
export type NewModule = InferInsertModel<typeof modules>;
export type NewTask = InferInsertModel<typeof tasks>;
export type NewResource = InferInsertModel<typeof resources>;
export type NewTaskResource = InferInsertModel<typeof taskResources>;
export type NewTaskProgress = InferInsertModel<typeof taskProgress>;
export type NewPlanGeneration = InferInsertModel<typeof planGenerations>;
export type NewGenerationAttempt = InferInsertModel<typeof generationAttempts>;

// Select types (for reading from database)
export type User = InferSelectModel<typeof users>;
export type LearningPlan = InferSelectModel<typeof learningPlans>;
export type Module = InferSelectModel<typeof modules>;
export type Task = InferSelectModel<typeof tasks>;
export type Resource = InferSelectModel<typeof resources>;
export type TaskResource = InferSelectModel<typeof taskResources>;
export type TaskProgress = InferSelectModel<typeof taskProgress>;
export type PlanGeneration = InferSelectModel<typeof planGenerations>;
export type GenerationAttempt = InferSelectModel<typeof generationAttempts>;

export interface TaskResourceWithResource extends TaskResource {
  resource: Resource;
}

export interface TaskWithRelations extends Task {
  resources: TaskResourceWithResource[];
  progress?: TaskProgress | null;
}

// Narrow variant without progress, kept for compatibility with older code
export type TaskWithResources = Task & {
  resources: TaskResourceWithResource[];
};

export interface ModuleWithTasks extends Module {
  tasks: TaskWithRelations[];
}

export interface LearningPlanWithModules extends LearningPlan {
  modules: ModuleWithTasks[];
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
  plan: LearningPlanWithModules;
  totalTasks: number;
  completedTasks: number;
  latestAttempt: GenerationAttempt | null;
  attemptsCount: number;
  latestJobStatus: 'pending' | 'processing' | 'completed' | 'failed' | null;
  latestJobError: string | null;
}

// User progress aggregation across tasks/modules
export type UserProgress = {
  user: User;
  completedTasks: number;
  totalTasks: number;
  completedModules: number;
  totalModules: number;
};
