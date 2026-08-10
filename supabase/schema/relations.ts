import { jobQueue } from './tables/jobs';
import {
  generationAttempts,
  learningPlans,
  planSchedules,
} from './tables/plans';
import {
  learningActivityEvents,
  modules,
  resources,
  taskProgress,
  taskResources,
  tasks,
} from './tables/tasks';
import { aiUsageEvents, usageMetrics } from './tables/usage';
import {
  userEmailNotificationPreferences,
  userEmailNotificationSettings,
  userPreferences,
} from './tables/user-preferences';
import { users } from './tables/users';
import { relations } from 'drizzle-orm';

export const usersRelations = relations(users, ({ one, many }) => ({
  userPreferences: one(userPreferences, {
    fields: [users.id],
    references: [userPreferences.userId],
  }),
  userEmailNotificationSettings: one(userEmailNotificationSettings, {
    fields: [users.id],
    references: [userEmailNotificationSettings.userId],
  }),
  userEmailNotificationPreferences: many(userEmailNotificationPreferences),
  learningPlans: many(learningPlans),
  usageMetrics: many(usageMetrics),
  aiUsageEvents: many(aiUsageEvents),
  jobQueue: many(jobQueue),
  taskProgress: many(taskProgress),
  learningActivityEvents: many(learningActivityEvents),
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
    learningActivityEvents: many(learningActivityEvents),
  }),
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
  }),
);

export const modulesRelations = relations(modules, ({ one, many }) => ({
  plan: one(learningPlans, {
    fields: [modules.planId],
    references: [learningPlans.id],
  }),
  tasks: many(tasks),
  learningActivityEvents: many(learningActivityEvents),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  module: one(modules, {
    fields: [tasks.moduleId],
    references: [modules.id],
  }),
  taskResources: many(taskResources),
  taskProgress: many(taskProgress),
  learningActivityEvents: many(learningActivityEvents),
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

export const learningActivityEventsRelations = relations(
  learningActivityEvents,
  ({ one }) => ({
    user: one(users, {
      fields: [learningActivityEvents.userId],
      references: [users.id],
    }),
    plan: one(learningPlans, {
      fields: [learningActivityEvents.planId],
      references: [learningPlans.id],
    }),
    module: one(modules, {
      fields: [learningActivityEvents.moduleId],
      references: [modules.id],
    }),
    task: one(tasks, {
      fields: [learningActivityEvents.taskId],
      references: [tasks.id],
    }),
  }),
);

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

export const userPreferencesRelations = relations(
  userPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [userPreferences.userId],
      references: [users.id],
    }),
  }),
);

export const userEmailNotificationSettingsRelations = relations(
  userEmailNotificationSettings,
  ({ one }) => ({
    user: one(users, {
      fields: [userEmailNotificationSettings.userId],
      references: [users.id],
    }),
  }),
);

export const userEmailNotificationPreferencesRelations = relations(
  userEmailNotificationPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [userEmailNotificationPreferences.userId],
      references: [users.id],
    }),
  }),
);
