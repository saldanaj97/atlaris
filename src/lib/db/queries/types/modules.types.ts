import type { InferSelectModel } from 'drizzle-orm';

type DbSchemaModule = typeof import('@/lib/db/schema');

/** Select model for resources table. */
export type Resource = InferSelectModel<DbSchemaModule['resources']>;

/** Select model for modules table. */
export type Module = InferSelectModel<DbSchemaModule['modules']>;

/** Select model for tasks table. */
export type Task = InferSelectModel<DbSchemaModule['tasks']>;

/** Select model for taskResources table. */
type TaskResource = InferSelectModel<DbSchemaModule['taskResources']>;

/** Select model for taskProgress table. */
export type TaskProgress = InferSelectModel<DbSchemaModule['taskProgress']>;

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

/** Per-module task completion aggregates for module navigation (storage / projection input). */
export interface ModuleTaskMetricRow {
  id: string;
  order: number;
  title: string;
  totalTaskCount: number;
  completedTaskCount: number;
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

/**
 * Storage bundle for module-detail read projection (`getModuleDetailRows`).
 */
export type ModuleDetailRows = {
  plan: { id: string; topic: string };
  module: Module;
  moduleMetricsRows: ModuleTaskMetricRow[];
  taskRows: Task[];
  progressRows: TaskProgress[];
  resourceRows: TaskResourceWithResource[];
};
