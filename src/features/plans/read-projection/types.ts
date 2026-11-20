import type { FreeAccessPlanCandidate } from '@/features/plans/policy/entitlement';
import type { ProgressStatus, ResourceType } from '@/shared/types/db.types';
import type { LessonContent } from '@/shared/types/lesson-content.types';

export type PlanReadStatus =
  | 'not_started'
  | 'active'
  | 'paused'
  | 'completed'
  | 'generating'
  | 'failed';

/**
 * List-filter status used by plan read projections.
 * `inactive` is the canonical URL/UI aggregate for paused rows.
 * `not_started` is the URL/UI bucket for ready plans with no completed tasks.
 */
export type FilterStatus =
  | 'all'
  | Exclude<PlanReadStatus, 'paused'>
  | 'inactive';

export const PLAN_LIST_PAGE_SIZE = 20 as const;

export const PLAN_LIST_SORTS = [
  'recommended',
  'recently_updated',
  'newest',
  'topic_asc',
  'topic_desc',
  'progress_asc',
  'progress_desc',
  'status_asc',
  'status_desc',
  'updated_asc',
] as const;

export type PlanListSort = (typeof PLAN_LIST_SORTS)[number];

export type PlanListQuery = {
  page: number;
  search: string;
  status: FilterStatus;
  sort: PlanListSort;
};

export type PlanListItem = {
  id: string;
  topic: string;
  createdAt: string;
  updatedAt: string | null;
  status: PlanReadStatus;
  completion: number;
  completedTasks: number;
  totalTasks: number;
  access?: 'full' | 'locked';
};

export type PlanListStatusCounts = Record<PlanReadStatus, number>;

export type PlanListPage = {
  items: PlanListItem[];
  page: number;
  pageSize: typeof PLAN_LIST_PAGE_SIZE;
  totalItems: number;
  totalPages: number;
  totalSearchResults: number;
  statusCounts: PlanListStatusCounts;
  referenceTimestamp: string;
  canCreatePlan?: boolean;
  selectionRequired?: boolean;
  selectionCandidates?: FreeAccessPlanCandidate[];
};

export type ModuleDetailResource = {
  id: string;
  order: number;
  notes: string | null;
  type: ResourceType;
  title: string;
  url: string;
  durationMinutes: number | null;
};

export type ModuleDetailTask = {
  id: string;
  order: number;
  title: string;
  description: string | null;
  estimatedMinutes: number;
  status: ProgressStatus;
  lessonContent: LessonContent | null;
  lessonContentUpdatedAt: Date | null;
  resources: ModuleDetailResource[];
  sources: LessonSource[];
};

export type LessonSource = {
  citationKey: string;
  title: string;
  publisher: string | null;
  url: string;
  retrievedAt: Date;
};

export type ModuleLessonGenerationStatus =
  | 'not_generated'
  | 'generating'
  | 'ready'
  | 'failed';

export type ModuleLessonGenerationSummary = {
  status: ModuleLessonGenerationStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  error: string | null;
};

export type ModuleDetailModule = {
  id: string;
  order: number;
  title: string;
  description: string | null;
  estimatedMinutes: number;
  lessonGeneration: ModuleLessonGenerationSummary;
  tasks: ModuleDetailTask[];
};

export type ModuleDetailNavItem = {
  id: string;
  order: number;
  title: string;
  isLocked: boolean;
  isComplete: boolean;
};

export type ModuleDetailReadModel = {
  module: ModuleDetailModule;
  planId: string;
  planTopic: string;
  totalModules: number;
  previousModuleId: string | null;
  nextModuleId: string | null;
  previousModulesComplete: boolean;
  allModules: ModuleDetailNavItem[];
};
