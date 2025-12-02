import {
  googleCalendarSyncState,
  learningPlans,
  modules,
  taskCalendarEvents,
  tasks,
  users,
} from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { syncPlanToGoogleCalendar } from '@/lib/integrations/google-calendar/sync';
import type { GoogleCalendarClient } from '@/lib/integrations/google-calendar/types';
import { eq } from 'drizzle-orm';
import type { calendar_v3 } from 'googleapis';
import { beforeEach, describe, expect, it } from 'vitest';

function createMockCalendarClient(): GoogleCalendarClient {
  let eventCounter = 0;
  const createdEvents = new Map<string, calendar_v3.Schema$Event>();

  const eventsApi = {
    async insert({
      calendarId: _calendarId,
      requestBody,
    }: {
      calendarId: string;
      requestBody: calendar_v3.Schema$Event;
    }): Promise<{ data: calendar_v3.Schema$Event }> {
      eventCounter++;
      const id = `event_${eventCounter}`;
      const event: calendar_v3.Schema$Event = {
        id,
        summary: requestBody.summary,
        description: requestBody.description,
        start: requestBody.start,
        end: requestBody.end,
      };
      createdEvents.set(id, event);
      return { data: event };
    },

    async delete({
      calendarId: _calendarId,
      eventId,
    }: {
      calendarId: string;
      eventId: string;
    }): Promise<void> {
      createdEvents.delete(eventId);
    },
  };

  return { events: eventsApi };
}

describe.skip('Google Calendar Sync E2E Flow (temporarily disabled)', () => {
  let userId: string;
  let planId: string;

  beforeEach(async () => {
    // Setup full test data
    await db.delete(taskCalendarEvents);
    await db.delete(googleCalendarSyncState);
    await db.delete(tasks);
    await db.delete(modules);
    await db.delete(learningPlans);
    await db.delete(users);

    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: 'e2e_gcal_test_user',
        email: 'e2e-gcal@example.com',
      })
      .returning();
    userId = user.id;

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'E2E Google Calendar Test Plan',
        skillLevel: 'intermediate',
        weeklyHours: 10,
        learningStyle: 'mixed',
        generationStatus: 'ready',
      })
      .returning();
    planId = plan.id;

    const [mod] = await db
      .insert(modules)
      .values({
        planId,
        title: 'Test Module',
        description: 'E2E test module for calendar sync',
        order: 1,
        estimatedMinutes: 120,
      })
      .returning();

    // Create multiple tasks to test batch sync
    await db.insert(tasks).values([
      {
        moduleId: mod.id,
        title: 'Test Task 1',
        description: 'First E2E test task',
        order: 1,
        estimatedMinutes: 30,
      },
      {
        moduleId: mod.id,
        title: 'Test Task 2',
        description: 'Second E2E test task',
        order: 2,
        estimatedMinutes: 45,
      },
    ]);
  });

  it('should complete full calendar sync workflow', async () => {
    const mockClient = createMockCalendarClient();

    const eventsCreated = await syncPlanToGoogleCalendar(planId, mockClient);

    expect(eventsCreated).toBe(2); // We created 2 tasks

    // Verify event mappings created
    const mappings = await db
      .select()
      .from(taskCalendarEvents)
      .where(eq(taskCalendarEvents.userId, userId));

    expect(mappings.length).toBe(eventsCreated);

    // Verify all mappings have required fields
    const eventIds = new Set<string>();
    for (const mapping of mappings) {
      expect(mapping.taskId).toBeTruthy();
      expect(mapping.calendarEventId).toMatch(/^event_\d+$/);
      expect(mapping.calendarId).toBe('primary');
      // Ensure each event ID is unique
      expect(eventIds.has(mapping.calendarEventId)).toBe(false);
      eventIds.add(mapping.calendarEventId);
    }

    // Verify sync state created
    const [syncState] = await db
      .select()
      .from(googleCalendarSyncState)
      .where(eq(googleCalendarSyncState.planId, planId));

    expect(syncState).toBeDefined();
    expect(syncState.calendarId).toBe('primary');
    expect(syncState.lastSyncedAt).toBeTruthy();
  });
});
