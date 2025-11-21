# Integration Dependency Injection Design

**Date**: 2025-11-20
**Status**: Approved
**Author**: Design Session with User

## Overview

Refactor third-party integrations (Google Calendar, Notion, Stripe) to use dependency injection instead of reading environment variables internally. This creates a clean separation between configuration (API routes) and business logic (integration functions), enabling true testability without module mocking.

## Problem Statement

### Current State

Integration functions like `syncPlanToGoogleCalendar` directly access environment variables via `googleOAuthEnv`:

```typescript
export async function syncPlanToGoogleCalendar(
  planId: string,
  accessToken: string,
  refreshToken?: string
): Promise<number> {
  const oauth2Client = new google.auth.OAuth2(
    googleOAuthEnv.clientId, // ← reads from env
    googleOAuthEnv.clientSecret, // ← reads from env
    googleOAuthEnv.redirectUri // ← reads from env
  );
  // ...
}
```

This causes several issues:

1. **E2E test failures**: Tests must mock the entire googleapis module because functions unconditionally access env vars, even when the API calls themselves are mocked
2. **Tight coupling**: Integration logic is coupled to global env state
3. **Limited testability**: Tests must manipulate `process.env` or use module-level mocks
4. **Inflexible**: Cannot easily support multiple providers, custom retry logic, or A/B testing configs
5. **CI complexity**: Must wire credentials into CI for tests that don't actually call external APIs

### Failing Test Example

```
FAIL   e2e  tests/e2e/google-calendar-sync-flow.spec.ts
Error: Missing required environment variable: GOOGLE_CLIENT_ID
 ❯ requireEnv src/lib/config/env.ts:32:11
 ❯ getServerRequired src/lib/config/env.ts:90:12
 ❯ Object.get clientId [as clientId] src/lib/config/env.ts:179:12
 ❯ syncPlanToGoogleCalendar src/lib/integrations/google-calendar/sync.ts:20:20
```

The test mocks googleapis API calls but can't prevent env access before the mock takes effect.

## Solution: Dependency Injection Architecture

### Core Principle

**Move the "where do I get config?" decision to the edges (API routes, test setup), not the core (integration logic).**

- **Integration functions** accept pre-configured client instances as parameters. They contain only business logic. Zero knowledge of OAuth configuration or environment variables.
- **API routes and request handlers** construct clients from environment variables. This is the boundary where "I'm in production/test" is determined.
- **Tests** pass mock client instances with no module mocking required.
- **Environment layer** remains mostly unchanged. OAuth credentials still use `getServerRequired`, but only API routes access them.

### Architecture Diagram

```
┌─────────────────┐
│   API Route     │ ← Reads googleOAuthEnv
│                 │ ← Constructs OAuth2Client
│                 │ ← Creates Calendar client
└────────┬────────┘
         │ passes GoogleCalendarClient
         ▼
┌─────────────────┐
│  Integration    │ ← Pure function
│    Function     │ ← No env access
│                 │ ← Just uses client
└─────────────────┘

┌─────────────────┐
│   E2E Test      │ ← Creates mock client
│                 │ ← No env needed
└────────┬────────┘
         │ passes mock GoogleCalendarClient
         ▼
┌─────────────────┐
│  Integration    │ ← Same pure function
│    Function     │ ← Doesn't know it's a mock
└─────────────────┘
```

## Component Interfaces and Types

### Google Calendar

```typescript
// src/lib/integrations/google-calendar/types.ts
import type { calendar_v3 } from 'googleapis';

// Re-export the googleapis type for convenience
export type GoogleCalendarClient = calendar_v3.Calendar;

// For tests to implement if they want to avoid importing googleapis
export interface CalendarEventsApi {
  insert(params: {
    calendarId: string;
    requestBody: calendar_v3.Schema$Event;
  }): Promise<{ data: calendar_v3.Schema$Event }>;

  delete(params: { calendarId: string; eventId: string }): Promise<void>;
}
```

### Notion

```typescript
// src/lib/integrations/notion/types.ts
import type { NotionClient } from './client';

// Our existing NotionClient class already works as the interface
export type { NotionClient };
```

### Updated Function Signatures

**Google Calendar - Before:**

```typescript
export async function syncPlanToGoogleCalendar(
  planId: string,
  accessToken: string,
  refreshToken?: string
): Promise<number>;
```

**Google Calendar - After:**

```typescript
export async function syncPlanToGoogleCalendar(
  planId: string,
  calendarClient: GoogleCalendarClient
): Promise<number>;
```

**Key change**: Functions no longer take raw OAuth tokens. They receive ready-to-use, authenticated clients. The caller handles authentication setup.

**Notion - Before:**

```typescript
export async function exportPlanToNotion(
  planId: string,
  userId: string,
  accessToken: string
): Promise<string>;
```

**Notion - After:**

```typescript
export async function exportPlanToNotion(
  planId: string,
  userId: string,
  notionClient: NotionClient
): Promise<string>;
```

## Data Flow and Caller Patterns

### Pattern 1: API Route Constructs Client

```typescript
// src/app/api/v1/google-calendar/sync/route.ts
import { google } from 'googleapis';
import { googleOAuthEnv } from '@/lib/config/env';
import { syncPlanToGoogleCalendar } from '@/lib/integrations/google-calendar/sync';

export async function POST(request: Request) {
  // ... auth checks, get user, get tokens from DB ...

  // Construct OAuth2 client from env (only place that reads env)
  const oauth2Client = new google.auth.OAuth2(
    googleOAuthEnv.clientId,
    googleOAuthEnv.clientSecret,
    googleOAuthEnv.redirectUri
  );

  oauth2Client.setCredentials({
    access_token: userAccessToken,
    refresh_token: userRefreshToken,
  });

  // Create Google Calendar client
  const calendarClient = google.calendar({
    version: 'v3',
    auth: oauth2Client,
  });

  // Pass client to integration function
  const eventsCreated = await syncPlanToGoogleCalendar(planId, calendarClient);

  return Response.json({ eventsCreated });
}
```

### Pattern 2: E2E Test Passes Mock Client

```typescript
// tests/e2e/google-calendar-sync-flow.spec.ts
import type { GoogleCalendarClient } from '@/lib/integrations/google-calendar/types';

// Create simple mock - no googleapis import needed, no module mocking
const createMockCalendarClient = (): GoogleCalendarClient => {
  let eventCounter = 0;

  return {
    events: {
      insert: async ({ requestBody }) => {
        eventCounter++;
        return {
          data: {
            id: `event_${eventCounter}`,
            summary: requestBody.summary,
            start: requestBody.start,
            end: requestBody.end,
          },
        };
      },
      delete: async () => {},
    },
  } as GoogleCalendarClient;
};

it('should sync plan to calendar', async () => {
  const mockClient = createMockCalendarClient();

  const eventsCreated = await syncPlanToGoogleCalendar(planId, mockClient);

  expect(eventsCreated).toBe(2);
});
```

### Pattern 3: Notion Follows Same Pattern

```typescript
// API route
const notionClient = new NotionClient(userAccessToken);
const pageId = await exportPlanToNotion(planId, userId, notionClient);

// Test
const mockNotionClient = createMockNotionClient();
const pageId = await exportPlanToNotion(planId, userId, mockNotionClient);
```

### Benefits of This Flow

- Environment variables read **once** at the API boundary
- Integration functions are **pure** - same inputs = same outputs
- Tests create lightweight mocks without module-level interception
- Easy to add logging, retries, rate limiting at client construction time
- Future-proof for multi-tenant scenarios, A/B testing, custom configs

## Migration Strategy

### Phase 1: Add New Signatures Alongside Old

Maintain backwards compatibility during transition:

```typescript
// src/lib/integrations/google-calendar/sync.ts

// NEW: Client-based version (preferred)
export async function syncPlanToGoogleCalendar(
  planId: string,
  calendarClient: GoogleCalendarClient
): Promise<number> {
  // Pure implementation - no env access
  const calendar = calendarClient;
  // ... rest of logic
}

// OLD: Deprecated version (temporary backwards compatibility)
/** @deprecated Use version that accepts GoogleCalendarClient */
export async function syncPlanToGoogleCalendarLegacy(
  planId: string,
  accessToken: string,
  refreshToken?: string
): Promise<number> {
  const oauth2Client = new google.auth.OAuth2(
    googleOAuthEnv.clientId,
    googleOAuthEnv.clientSecret,
    googleOAuthEnv.redirectUri
  );
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  // Delegate to new implementation
  return syncPlanToGoogleCalendar(planId, calendar);
}
```

### Phase 2: Update Callers Incrementally

1. Update API routes to construct clients and use new signature
2. Update tests to use mock clients
3. Verify each caller works before moving to next
4. Remove legacy function once all callers migrated

### Phase 3: Environment Layer Cleanup (Optional Follow-up)

Once integrations no longer read OAuth env internally:

1. Change `googleOAuthEnv` from `getServerRequired` to `getServerRequiredProdOnly` (make optional in test)
2. Add centralized test env bootstrap (`tests/setup/test-env.ts`)
3. Document which env vars are required in which environments

### Migration Order

1. **Google Calendar** (fixes failing E2E test immediately)
2. **Notion** (similar pattern, should be straightforward)
3. **Stripe** (already has lazy init, lowest priority)

### Rollback Safety

- Keep legacy functions until 100% migrated
- Each integration can be migrated independently
- No schema changes or database migrations needed
- Can roll back individual integrations without affecting others

## Benefits and Trade-offs

### Benefits

1. **True testability**: No module mocking, no env manipulation, just pass mock objects
2. **Decoupling**: Integration logic independent of global state
3. **Flexibility**: Easy to support custom configs, multiple providers, A/B testing
4. **Type safety**: Config structure enforced by TypeScript interfaces
5. **Future-proof**: Supports multi-tenant scenarios, custom retry logic, advanced configurations
6. **Cleaner CI**: Tests don't need real credentials if they're fully mocked
7. **Explicit dependencies**: Function signatures declare exactly what they need

### Trade-offs

1. **More setup code in API routes**: Callers must construct clients (but this code belongs there - it's the boundary)
2. **Parameter passing**: More parameters to pass down (but makes dependencies explicit)
3. **Migration effort**: Need to update all callers (but can be done incrementally)

The trade-offs are worth it for the testability and architectural cleanliness we gain.

## Implementation Phases

### Phase 1: Google Calendar Refactor

**Files to modify:**

- `src/lib/integrations/google-calendar/types.ts` (new file - type definitions)
- `src/lib/integrations/google-calendar/sync.ts` (update function signature)
- API routes that call `syncPlanToGoogleCalendar` (construct and pass client)
- `tests/e2e/google-calendar-sync-flow.spec.ts` (use mock client)
- Remove `tests/mocks/e2e/googleapis.e2e.ts` (no longer needed)

**Success criteria:**

- E2E test passes without env vars
- No module-level mocks required
- API routes work with real Google Calendar API in staging/production

### Phase 2: Notion Refactor

**Files to modify:**

- `src/lib/integrations/notion/types.ts` (new file - type definitions)
- `src/lib/integrations/notion/sync.ts` (update function signature)
- API routes that call `exportPlanToNotion`
- `tests/e2e/notion-export-flow.spec.ts` (use mock client)
- Remove `tests/mocks/e2e/notion-client.e2e.ts` (no longer needed)

**Success criteria:**

- E2E tests pass with lightweight mocks
- Notion client construction isolated to API boundary

### Phase 3: Stripe Refactor (Optional)

Stripe already has lazy initialization. Low priority, but can follow same pattern for consistency.

### Phase 4: Environment Layer Cleanup (Optional)

After all integrations migrated:

- Update env.ts to distinguish prod-required vs test-optional
- Add test env bootstrap
- Document env requirements matrix

## Future Considerations

This design enables:

1. **Multi-tenant support**: Different OAuth configs per tenant
2. **Provider switching**: Easy to swap Google Calendar for Outlook, etc.
3. **Advanced retry logic**: Configure at client construction, not per-function
4. **Rate limiting**: Centralized at client level
5. **Observability**: Wrap clients with logging/tracing without touching business logic
6. **Testing scenarios**: Mock specific API failures at client level

## Conclusion

This refactor moves us from tightly-coupled, env-dependent integration code to loosely-coupled, testable, dependency-injected architecture. The migration can be done incrementally with low risk, and the benefits (true testability, flexibility, future-proofing) far outweigh the trade-offs (more setup code, migration effort).
