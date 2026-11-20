import type { InferSelectModel } from 'drizzle-orm';

type DbSchemaModule = typeof import('@supabase/schema');

export type Resource = InferSelectModel<DbSchemaModule['resources']>;

export type Module = InferSelectModel<DbSchemaModule['modules']>;

export type Task = InferSelectModel<DbSchemaModule['tasks']>;

type TaskResource = InferSelectModel<DbSchemaModule['taskResources']>;

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

export interface PlanDetailTaskWithRelations extends Omit<
  Task,
  'lessonContent' | 'lessonContentUpdatedAt'
> {
  resources: TaskResourceWithResource[];
  progress?: TaskProgress | null;
}

export interface PlanDetailModuleWithTasks extends Module {
  tasks: PlanDetailTaskWithRelations[];
}

export interface ModuleTaskMetricRow {
  id: string;
  order: number;
  title: string;
  totalTaskCount: number;
  completedTaskCount: number;
}

export type ModuleResourceRow = {
  id: string;
  taskId: string;
  resourceId: string;
  order: number;
  notes: string | null;
  createdAt: Date;
  resource: Resource;
};

export type ModuleDetailRows = {
  plan: { id: string; topic: string };
  module: Module;
  moduleMetricsRows: ModuleTaskMetricRow[];
  taskRows: Task[];
  progressRows: TaskProgress[];
  resourceRows: TaskResourceWithResource[];
};
