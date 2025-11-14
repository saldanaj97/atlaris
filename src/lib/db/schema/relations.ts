import { relations } from 'drizzle-orm';

import {
  generationAttempts,
  learningPlans,
  planGenerations,
  planSchedules,
} from './tables/plans';
import {
  integrationTokens,
  googleCalendarSyncState,
  notionSyncState,
  taskCalendarEvents,
} from './tables/integrations';
import { jobQueue } from './tables/jobs';
import {
  resources,
  modules,
  taskResources,
  taskProgress,
  tasks,
} from './tables/tasks';
import { users } from './tables/users';
import { aiUsageEvents, usageMetrics } from './tables/usage';

export const usersRelations = relations(users, ({ many }) => ({
  learningPlans: many(learningPlans),
  integrationTokens: many(integrationTokens),
  notionSyncState: many(notionSyncState),
  googleCalendarSyncState: many(googleCalendarSyncState),
  usageMetrics: many(usageMetrics),
  aiUsageEvents: many(aiUsageEvents),
  jobQueue: many(jobQueue),
  taskProgress: many(taskProgress),
  taskCalendarEvents: many(taskCalendarEvents),
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
    planGenerations: many(planGenerations),
    generationAttempts: many(generationAttempts),
    notionSyncState: one(notionSyncState),
    googleCalendarSyncState: one(googleCalendarSyncState),
    jobQueue: many(jobQueue),
  })
);

export const planSchedulesRelations = relations(planSchedules, ({ one }) => ({
  plan: one(learningPlans, {
    fields: [planSchedules.planId],
    references: [learningPlans.id],
  }),
}));

export const planGenerationsRelations = relations(
  planGenerations,
  ({ one }) => ({
    plan: one(learningPlans, {
      fields: [planGenerations.planId],
      references: [learningPlans.id],
    }),
  })
);

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
  calendarEvents: many(taskCalendarEvents),
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

export const integrationTokensRelations = relations(
  integrationTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [integrationTokens.userId],
      references: [users.id],
    }),
  })
);

export const notionSyncStateRelations = relations(
  notionSyncState,
  ({ one }) => ({
    plan: one(learningPlans, {
      fields: [notionSyncState.planId],
      references: [learningPlans.id],
    }),
    user: one(users, {
      fields: [notionSyncState.userId],
      references: [users.id],
    }),
  })
);

export const googleCalendarSyncStateRelations = relations(
  googleCalendarSyncState,
  ({ one }) => ({
    plan: one(learningPlans, {
      fields: [googleCalendarSyncState.planId],
      references: [learningPlans.id],
    }),
    user: one(users, {
      fields: [googleCalendarSyncState.userId],
      references: [users.id],
    }),
  })
);

export const taskCalendarEventsRelations = relations(
  taskCalendarEvents,
  ({ one }) => ({
    task: one(tasks, {
      fields: [taskCalendarEvents.taskId],
      references: [tasks.id],
    }),
    user: one(users, {
      fields: [taskCalendarEvents.userId],
      references: [users.id],
    }),
  })
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
