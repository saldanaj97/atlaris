# Integrations Module

**Parent:** [Root AGENTS.md](../../../AGENTS.md)

## Overview

Third-party sync for Notion and Google Calendar. Uses dependency injection for testability.

## Architecture (DI Pattern)

Each integration follows factory + types + sync structure:

```
integrations/
├── oauth.ts              # Shared OAuth utilities
├── oauth-state.ts        # CSRF state management
├── notion/
│   ├── types.ts          # NotionIntegrationClient interface
│   ├── factory.ts        # createNotionClient()
│   ├── sync.ts           # syncPlanToNotion(), deltaSyncPlanToNotion()
│   ├── mapper.ts         # Plan → Notion blocks
│   └── client.ts         # Low-level client wrapper
└── google-calendar/
    ├── types.ts          # GoogleCalendarClient interface
    ├── factory.ts        # createGoogleCalendarClient()
    ├── sync.ts           # syncPlanToGoogleCalendar()
    └── mapper.ts         # Tasks → Calendar events
```

## Key Pattern

**Sync functions accept minimal interfaces, not SDK types:**

```typescript
// types.ts - minimal interface
export interface GoogleCalendarClient {
  events: {
    insert(params: { calendarId: string; requestBody: Event }): Promise<{ data: Event }>;
    delete(params: { calendarId: string; eventId: string }): Promise<void>;
  };
}

// sync.ts - depends on interface, not SDK
export async function syncPlanToGoogleCalendar(
  planId: string,
  client: GoogleCalendarClient  // Injected, not imported
): Promise<void> { ... }

// factory.ts - creates real client at API boundary
export function createGoogleCalendarClient(tokens: GoogleTokens): GoogleCalendarClient {
  const oauth2Client = new google.auth.OAuth2(...);
  // Returns object matching interface
}
```

## API Routes

```typescript
// src/app/api/v1/integrations/google-calendar/sync/route.ts
import { createGoogleCalendarClient } from '@/lib/integrations/google-calendar/factory';
import { syncPlanToGoogleCalendar } from '@/lib/integrations/google-calendar/sync';

export async function POST(request: Request) {
  const tokens = await getTokensFromDb(userId);
  const client = createGoogleCalendarClient(tokens); // Factory at boundary
  await syncPlanToGoogleCalendar(planId, client);
}
```

## Testing

Pass mock clients directly - no module mocking needed:

```typescript
const mockClient: GoogleCalendarClient = {
  events: {
    insert: vi.fn().mockResolvedValue({ data: { id: 'event_1' } }),
    delete: vi.fn().mockResolvedValue(undefined),
  },
};

await syncPlanToGoogleCalendar(planId, mockClient);
expect(mockClient.events.insert).toHaveBeenCalledWith(...);
```

## OAuth Flow

1. **Initiate**: `/api/v1/auth/google` → redirect to Google
2. **Callback**: `/api/v1/auth/google/callback` → exchange code, store tokens
3. **Sync**: `/api/v1/integrations/google-calendar/sync` → use stored tokens

Tokens stored in `integration_tokens` table with `provider` enum.

## Environment

Credentials via `@/lib/config/env`:

- `googleOAuthEnv.clientId`, `.clientSecret`, `.redirectUri`
- `notionOAuthEnv.clientId`, `.clientSecret`, `.redirectUri`

Prod-required, test-optional semantics.

## Anti-Patterns

- Importing SDK types in sync functions (use minimal interfaces)
- Creating clients inside sync functions (use factory at boundary)
- Module mocking instead of DI
- Hardcoding credentials (use `@/lib/config/env`)
