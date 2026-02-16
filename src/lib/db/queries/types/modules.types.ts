import type { InferSelectModel } from 'drizzle-orm';

import {
  modules,
  resources,
  taskProgress,
  taskResources,
  tasks,
} from '@/lib/db/schema';

/** Select model for resources table. */
export type Resource = InferSelectModel<typeof resources>;

/** Select model for modules table. */
export type Module = InferSelectModel<typeof modules>;

/** Select model for tasks table. */
export type Task = InferSelectModel<typeof tasks>;

/** Select model for taskResources table. */
export type TaskResource = InferSelectModel<typeof taskResources>;

/** Select model for taskProgress table. */
export type TaskProgress = InferSelectModel<typeof taskProgress>;

export interface TaskResourceWithResource extends TaskResource {
  resource: Resource;
}

export interface TaskWithRelations extends Task {
  resources: TaskResourceWithResource[];
  progress?: TaskProgress | null;
}

export interface ModuleWithTasks extends Module {
  tasks: TaskWithRelations[];
}

/**
 * Minimal module info for the plan navigation dropdown (sidebar/breadcrumb).
 * Includes lock state so UI can disable links to modules that are not yet unlockable.
 */
export interface ModuleNavItem {
  id: string;
  order: number;
  title: string;
  /** Whether this module is locked (previous modules not completed) */
  isLocked: boolean;
}

/**
 * Full module detail response: module with tasks, resources, and progress, plus
 * plan-level context for breadcrumb navigation and prev/next links.
 */
export interface ModuleDetail {
  module: ModuleWithTasks;
  planId: string;
  planTopic: string;
  totalModules: number;
  previousModuleId: string | null;
  nextModuleId: string | null;
  /** Whether all previous modules have been fully completed */
  previousModulesComplete: boolean;
  /** All modules in the plan for navigation dropdown */
  allModules: ModuleNavItem[];
}

/** Raw module row from DB select (id, order, title) for nav item computation. */
export interface ModuleNavRaw {
  id: string;
  order: number;
  title: string;
}

/** Resource row shape from taskResources + resources join. */
export type ModuleResourceRow = {
  id: string;
  taskId: string;
  resourceId: string;
  order: number;
  notes: string | null;
  createdAt: Date;
  resource: Resource;
};
