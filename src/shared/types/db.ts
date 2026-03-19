import {
  generationStatus,
  learningStyle,
  progressStatus,
  resourceType,
  skillLevel,
} from '@/lib/db/enums';
export type {
  GenerationAttempt,
  GenerationStatus,
  LearningPlan,
  LearningPlanDetail,
  LearningPlanWithModules,
  LightweightPlanSummary,
  LearningStyle,
  Module,
  PlanSummary,
  ProgressStatus,
  ResourceType,
  SkillLevel,
  Task,
  TaskProgress,
  TaskResource,
  TaskWithResources,
  User,
} from './db.types';

// Enum values
export const SKILL_LEVELS = skillLevel.enumValues;
export const LEARNING_STYLES = learningStyle.enumValues;
export const RESOURCE_TYPES = resourceType.enumValues;
export const PROGRESS_STATUSES = progressStatus.enumValues;
export const GENERATION_STATUSES = generationStatus.enumValues;
