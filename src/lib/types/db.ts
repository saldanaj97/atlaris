import type {
  ModuleWithTasks,
  TaskResourceWithResource,
} from '@/lib/db/queries/types/modules.types';
import type { InferSelectModel } from 'drizzle-orm';

import {
  generationStatus,
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
export const GENERATION_STATUSES = generationStatus.enumValues;

// Enum types
export type SkillLevel = (typeof SKILL_LEVELS)[number];
export type LearningStyle = (typeof LEARNING_STYLES)[number];
export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

// Select types (for reading from database)
export type User = InferSelectModel<typeof users>;
export type LearningPlan = InferSelectModel<typeof learningPlans>;
export type Module = InferSelectModel<typeof modules>;
export type Task = InferSelectModel<typeof tasks>;
export type TaskResource = InferSelectModel<typeof taskResources>;
export type TaskProgress = InferSelectModel<typeof taskProgress>;
export type PlanGeneration = InferSelectModel<typeof planGenerations>;
export type GenerationAttempt = InferSelectModel<typeof generationAttempts>;

// Narrow variant without progress, kept for compatibility with older code
export type TaskWithResources = Task & {
  resources: TaskResourceWithResource[];
};

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
}
