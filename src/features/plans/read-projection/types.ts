import type { DbClient } from '@/lib/db/types';
import type { ProgressStatus, ResourceType } from '@/shared/types/db.types';
import type { LessonContent } from '@/shared/types/lesson-content.types';

export type PlanDbClient = DbClient;

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
};

/** Flat resource on module-detail task (type/title/url map to UI). */
export type ModuleDetailResource = {
  id: string;
  order: number;
  notes: string | null;
  type: ResourceType;
  title: string;
  url: string;
  durationMinutes: number | null;
};

/**
 * Task row for module-detail page (persisted progress as `status`, not nested progress row).
 */
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

/**
 * Current module with nested tasks for module-detail chrome and lessons UI.
 */
export type ModuleDetailModule = {
  id: string;
  order: number;
  title: string;
  description: string | null;
  estimatedMinutes: number;
  lessonGeneration: ModuleLessonGenerationSummary;
  tasks: ModuleDetailTask[];
};

/** Plan module picker item with sequential lock semantics. */
export type ModuleDetailNavItem = {
  id: string;
  order: number;
  title: string;
  isLocked: boolean;
};

/** Server read-model for `/plans/[planId]/modules/[moduleId]`. */
export type ModuleDetailReadModel = {
  module: ModuleDetailModule;
  planId: string;
  planTopic: string;
  totalModules: number;
  previousModuleId: string | null;
  nextModuleId: string | null;
  /** True when all modules before the current one are complete (inverse of nav lock on current). */
  previousModulesComplete: boolean;
  allModules: ModuleDetailNavItem[];
};
