import { relations } from 'drizzle-orm';
import { jobQueue } from './tables/jobs';
import {
  generationAttempts,
  learningPlans,
  planSchedules,
} from './tables/plans';
import {
  modules,
  resources,
  taskProgress,
  taskResources,
  tasks,
} from './tables/tasks';
import { aiUsageEvents, usageMetrics } from './tables/usage';
import { users } from './tables/users';

export const usersRelations = relations(users, ({ many }) => ({
  learningPlans: many(learningPlans),
  usageMetrics: many(usageMetrics),
  aiUsageEvents: many(aiUsageEvents),
  jobQueue: many(jobQueue),
  taskProgress: many(taskProgress),
}));

export const learningPlansRelations = relations(
  learningPlans,
  ({ one, many }) => ({
    user: one(users, {
      fields: [learningPlans.userId],
      references: [users.id],
    }),
    modules: many(modules),
    planSchedules: one(planSchedules),
    generationAttempts: many(generationAttempts),
    jobQueue: many(jobQueue),
  })
);

export const planSchedulesRelations = relations(planSchedules, ({ one }) => ({
  plan: one(learningPlans, {
    fields: [planSchedules.planId],
    references: [learningPlans.id],
  }),
}));

export const generationAttemptsRelations = relations(
  generationAttempts,
  ({ one }) => ({
    plan: one(learningPlans, {
      fields: [generationAttempts.planId],
      references: [learningPlans.id],
    }),
  })
);

export const modulesRelations = relations(modules, ({ one, many }) => ({
  plan: one(learningPlans, {
    fields: [modules.planId],
    references: [learningPlans.id],
  }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  module: one(modules, {
    fields: [tasks.moduleId],
    references: [modules.id],
  }),
  taskResources: many(taskResources),
  taskProgress: many(taskProgress),
}));

export const resourcesRelations = relations(resources, ({ many }) => ({
  taskResources: many(taskResources),
}));

export const taskResourcesRelations = relations(taskResources, ({ one }) => ({
  task: one(tasks, {
    fields: [taskResources.taskId],
    references: [tasks.id],
  }),
  resource: one(resources, {
    fields: [taskResources.resourceId],
    references: [resources.id],
  }),
}));

export const taskProgressRelations = relations(taskProgress, ({ one }) => ({
  task: one(tasks, {
    fields: [taskProgress.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskProgress.userId],
    references: [users.id],
  }),
}));

export const usageMetricsRelations = relations(usageMetrics, ({ one }) => ({
  user: one(users, {
    fields: [usageMetrics.userId],
    references: [users.id],
  }),
}));

export const aiUsageEventsRelations = relations(aiUsageEvents, ({ one }) => ({
  user: one(users, {
    fields: [aiUsageEvents.userId],
    references: [users.id],
  }),
}));

export const jobQueueRelations = relations(jobQueue, ({ one }) => ({
  plan: one(learningPlans, {
    fields: [jobQueue.planId],
    references: [learningPlans.id],
  }),
  user: one(users, {
    fields: [jobQueue.userId],
    references: [users.id],
  }),
}));
