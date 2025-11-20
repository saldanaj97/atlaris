import '../mocks/e2e/googleapis.e2e';
import { resetMockEventCounter } from '../mocks/e2e/googleapis.e2e';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db/service-role';
import {
  users,
  learningPlans,
  modules,
  tasks,
  taskCalendarEvents,
  googleCalendarSyncState,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { syncPlanToGoogleCalendar } from '@/lib/integrations/google-calendar/sync';

describe('Google Calendar Sync E2E Flow', () => {
  let userId: string;
  let planId: string;

  beforeEach(async () => {
    // Reset mock counter for unique event IDs
    resetMockEventCounter();

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
    const eventsCreated = await syncPlanToGoogleCalendar(
      planId,
      'e2e_access_token',
      'e2e_refresh_token'
    );

    expect(eventsCreated).toBeGreaterThan(0);
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
