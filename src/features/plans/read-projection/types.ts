import type { DbClient } from '@/lib/db/types';
import type { ProgressStatus, ResourceType } from '@/shared/types/db.types';

export type PlanDbClient = DbClient;

export type PlanReadStatus =
  | 'active'
  | 'paused'
  | 'completed'
  | 'generating'
  | 'failed';

/**
 * List-filter status used by plan read projections.
 * `inactive` is a UI aggregate for non-active plan rows rather than a DB status.
 */
export type FilterStatus = 'all' | PlanReadStatus | 'inactive';

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
  resources: ModuleDetailResource[];
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
