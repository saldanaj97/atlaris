## Task 13: Google Calendar - Sync Endpoint

**Files:**

- Create: `src/lib/integrations/google-calendar/sync.ts`
- Create: `src/app/api/v1/integrations/google-calendar/sync/route.ts`
- Create: `tests/integration/google-calendar-sync.spec.ts`

**Step 1: Write failing test**

Create `tests/integration/google-calendar-sync.spec.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/v1/integrations/google-calendar/sync/route';
import { db } from '@/lib/db/drizzle';
import { users, learningPlans, modules, tasks } from '@/lib/db/schema';
import { storeOAuthTokens } from '@/lib/integrations/oauth';

describe('Google Calendar Sync API', () => {
  it('should create calendar events for plan tasks', async () => {
    // Setup test data (user, plan, modules, tasks)
    // Mock Google Calendar API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'event_123', status: 'confirmed' }),
    });

    const request = new Request(
      'http://localhost:3000/api/v1/integrations/google-calendar/sync',
      {
        method: 'POST',
        body: JSON.stringify({ planId: 'test-plan' }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.eventsCreated).toBeGreaterThan(0);
  });
});
```

**Step 2: Implement sync function**

Create `src/lib/integrations/google-calendar/sync.ts`:

```typescript
import { google } from 'googleapis';
import { db } from '@/lib/db/drizzle';
import {
  learningPlans,
  modules,
  tasks,
  taskCalendarEvents,
  googleCalendarSyncState,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
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

  const planModules = await db
    .select()
    .from(modules)
    .where(eq(modules.planId, planId))
    .orderBy(modules.order);

  const planTasks = await db.select().from(tasks);
  const allTasks = planModules.flatMap((mod) =>
    planTasks.filter((t) => t.moduleId === mod.id)
  );

  // Generate schedule
  const schedule = generateSchedule(allTasks, plan.weeklyHours);

  let eventsCreated = 0;

  for (const task of allTasks) {
    const startTime = schedule.get(task.id);
    if (!startTime) continue;

    const eventData = mapTaskToCalendarEvent(task, startTime);

    const { data: event } = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: eventData,
    });

    // Store mapping
    await db.insert(taskCalendarEvents).values({
      taskId: task.id,
      userId: plan.userId,
      calendarEventId: event.id!,
      calendarId: 'primary',
    });

    eventsCreated++;
  }

  // Store sync state
  await db.insert(googleCalendarSyncState).values({
    planId,
    userId: plan.userId,
    calendarId: 'primary',
    lastSyncedAt: new Date(),
  });

  return eventsCreated;
}
```

**Step 3: Create API endpoint**

Create `src/app/api/v1/integrations/google-calendar/sync/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getOAuthTokens } from '@/lib/integrations/oauth';
import { syncPlanToGoogleCalendar } from '@/lib/integrations/google-calendar/sync';

export async function POST(request: NextRequest) {
  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const googleTokens = await getOAuthTokens(user.id, 'google_calendar');
  if (!googleTokens) {
    return NextResponse.json(
      { error: 'Google Calendar not connected' },
      { status: 401 }
    );
  }

  const { planId } = await request.json();

  if (!planId) {
    return NextResponse.json({ error: 'planId required' }, { status: 400 });
  }

  try {
    const eventsCreated = await syncPlanToGoogleCalendar(
      planId,
      googleTokens.accessToken,
      googleTokens.refreshToken
    );

    return NextResponse.json({ eventsCreated, success: true });
  } catch (error) {
    console.error('Google Calendar sync failed:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
```

**Step 4: Run test**

Run:

```bash
pnpm vitest run tests/integration/google-calendar-sync.spec.ts
```

Expected: PASS

**Step 5: Run Coderabbit CLI and implement suggestions**

Run `coderabbit --prompt-only -t uncommitted` and implement any suggestions from the review.

**Step 6: Commit**

```bash
git add src/lib/integrations/google-calendar/ src/app/api/v1/integrations/google-calendar/ tests/integration/google-calendar-sync.spec.ts
git commit -m "feat(google): add calendar sync endpoint

Implement sync functionality to create Google Calendar events from
learning plan tasks with intelligent scheduling.

Changes:
- Add syncPlanToGoogleCalendar function
- Add POST /api/v1/integrations/google-calendar/sync endpoint
- Store task-to-event mappings in database
- Use generateSchedule for time distribution

New files:
- src/lib/integrations/google-calendar/sync.ts
- src/app/api/v1/integrations/google-calendar/sync/route.ts
- tests/integration/google-calendar-sync.spec.ts

Tests cover:
- Event creation for all plan tasks"
```

**Step 7: Open PR into main**

Create a pull request from the current branch into main, following the commit message guidelines.

---
