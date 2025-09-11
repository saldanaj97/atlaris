import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type {
  learningPlans,
  modules,
  planGenerations,
  resources,
  taskProgress,
  taskResources,
  tasks,
  users,
} from './schema';

// Select types (for reading from database)
export type User = InferSelectModel<typeof users>;
export type LearningPlan = InferSelectModel<typeof learningPlans>;
export type Module = InferSelectModel<typeof modules>;
export type Task = InferSelectModel<typeof tasks>;
export type Resource = InferSelectModel<typeof resources>;
export type TaskResource = InferSelectModel<typeof taskResources>;
export type TaskProgress = InferSelectModel<typeof taskProgress>;
export type PlanGeneration = InferSelectModel<typeof planGenerations>;

// Insert types (for creating new records)
export type NewUser = InferInsertModel<typeof users>;
export type NewLearningPlan = InferInsertModel<typeof learningPlans>;
export type NewModule = InferInsertModel<typeof modules>;
export type NewTask = InferInsertModel<typeof tasks>;
export type NewResource = InferInsertModel<typeof resources>;
export type NewTaskResource = InferInsertModel<typeof taskResources>;
export type NewTaskProgress = InferInsertModel<typeof taskProgress>;
export type NewPlanGeneration = InferInsertModel<typeof planGenerations>;

// Enum types
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';
export type LearningStyle = 'reading' | 'video' | 'practice' | 'mixed';
export type ResourceType = 'youtube' | 'article' | 'course' | 'doc' | 'other';
export type ProgressStatus = 'not_started' | 'in_progress' | 'completed';

// Composite types for common queries
export type LearningPlanWithModules = LearningPlan & {
  modules: Module[];
};

export type ModuleWithTasks = Module & {
  tasks: Task[];
};

export type TaskWithResources = Task & {
  resources: (TaskResource & { resource: Resource })[];
};

export type UserProgress = {
  user: User;
  completedTasks: number;
  totalTasks: number;
  completedModules: number;
  totalModules: number;
};
