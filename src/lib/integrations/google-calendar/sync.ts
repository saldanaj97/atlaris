import { google } from 'googleapis';
import { db } from '@/lib/db/drizzle';
import {
  learningPlans,
  modules,
  tasks,
  taskCalendarEvents,
  googleCalendarSyncState,
} from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { mapTaskToCalendarEvent, generateSchedule } from './mapper';

export async function syncPlanToGoogleCalendar(
  planId: string,
  accessToken: string,
  refreshToken?: string
): Promise<number> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  // Fetch plan data
  const [plan] = await db
    .select()
    .from(learningPlans)
    .where(eq(learningPlans.id, planId))
    .limit(1);

  if (!plan) {
    throw new Error('Plan not found');
  }

  // Fetch modules ordered by their order field
  const planModules = await db
    .select()
    .from(modules)
    .where(eq(modules.planId, planId))
    .orderBy(modules.order);

  if (planModules.length === 0) {
    throw new Error('No modules found for plan');
  }

  // Fetch tasks for these modules using efficient DB filtering
  const moduleIds = planModules.map((m) => m.id);
  const allTasks = await db
    .select()
    .from(tasks)
    .where(inArray(tasks.moduleId, moduleIds));

  // Build module index map from planModules to preserve plan sequence
  const moduleIndex = new Map<string, number>();
  for (let i = 0; i < planModules.length; i++) {
    moduleIndex.set(planModules[i].id, i);
  }

  // Stable sort tasks by: module order, then task.order, then createdAt, then id
  const sortedTasks = [...allTasks].sort((a, b) => {
    const aModuleIdx = moduleIndex.get(a.moduleId) ?? Number.POSITIVE_INFINITY;
    const bModuleIdx = moduleIndex.get(b.moduleId) ?? Number.POSITIVE_INFINITY;
    if (aModuleIdx !== bModuleIdx) return aModuleIdx - bModuleIdx;

    const aOrder = typeof a.order === 'number' ? a.order : null;
    const bOrder = typeof b.order === 'number' ? b.order : null;
    if (aOrder !== null || bOrder !== null) {
      const ao = aOrder ?? Number.POSITIVE_INFINITY;
      const bo = bOrder ?? Number.POSITIVE_INFINITY;
      if (ao !== bo) return ao - bo;
    }

    const toTime = (d: unknown): number | null => {
      if (!d) return null;
      if (d instanceof Date) return d.getTime();
      if (typeof d === 'string' || typeof d === 'number') {
        const t = new Date(d).getTime();
        return Number.isNaN(t) ? null : t;
      }
      return null;
    };
    const aTime = toTime(a.createdAt);
    const bTime = toTime(b.createdAt);
    if (aTime !== null || bTime !== null) {
      const at = aTime ?? Number.POSITIVE_INFINITY;
      const bt = bTime ?? Number.POSITIVE_INFINITY;
      if (at !== bt) return at - bt;
    }

    return String(a.id).localeCompare(String(b.id));
  });

  // Map tasks to the format expected by generateSchedule
  const mappedTasks = sortedTasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    estimatedMinutes: task.estimatedMinutes,
  }));

  // Generate schedule
  const schedule = generateSchedule(mappedTasks, plan.weeklyHours);

  let eventsCreated = 0;
  const errors: Array<{ taskId: string; error: string }> = [];

  for (const task of sortedTasks) {
    const startTime = schedule.get(task.id);
    if (!startTime) continue;

    try {
      // Check if event already exists for this task
      const [existingMapping] = await db
        .select()
        .from(taskCalendarEvents)
        .where(eq(taskCalendarEvents.taskId, task.id))
        .limit(1);

      if (existingMapping) {
        // Event already exists, skip
        continue;
      }

      // Map task to calendar event format
      const eventData = mapTaskToCalendarEvent(
        {
          id: task.id,
          title: task.title,
          description: task.description,
          estimatedMinutes: task.estimatedMinutes,
        },
        startTime
      );

      // Create event in Google Calendar with retry logic
      let event;
      let retries = 3;
      while (retries > 0) {
        try {
          const response = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: eventData,
          });
          event = response.data;
          break;
        } catch (apiError) {
          retries--;
          if (retries === 0) throw apiError;
          // Wait before retry (exponential backoff)
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * (4 - retries))
          );
        }
      }

      // Validate event ID exists
      if (!event?.id) {
        throw new Error('Google Calendar did not return a valid event ID');
      }

      // Store mapping between task and calendar event
      try {
        await db.insert(taskCalendarEvents).values({
          taskId: task.id,
          userId: plan.userId,
          calendarEventId: event.id,
          calendarId: 'primary',
        });
        eventsCreated++;
      } catch (dbError) {
        // DB insert failed, delete the created event to avoid orphans
        try {
          await calendar.events.delete({
            calendarId: 'primary',
            eventId: event.id,
          });
        } catch {
          // Ignore deletion errors
        }
        throw dbError;
      }
    } catch (error) {
      // Log error but continue with other tasks
      errors.push({
        taskId: task.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // If all tasks failed, throw error
  if (errors.length > 0 && eventsCreated === 0) {
    throw new Error(
      `Failed to sync any events. Errors: ${JSON.stringify(errors)}`
    );
  }

  // Store sync state
  const syncState = {
    planId,
    userId: plan.userId,
    calendarId: 'primary',
    lastSyncedAt: new Date(),
  };

  await db
    .insert(googleCalendarSyncState)
    .values(syncState)
    .onConflictDoUpdate({
      target: googleCalendarSyncState.planId,
      set: {
        ...syncState,
        updatedAt: new Date(),
      },
    });

  return eventsCreated;
}
