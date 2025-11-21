# Integration Dependency Injection Architecture

## Overview

This document describes the dependency injection architecture implemented for third-party integrations (Google Calendar, Notion) to improve testability, maintainability, and separation of concerns.

## Architecture Principles

### 1. Separation of Concerns

The integration architecture is split into three distinct layers:

1. **Environment Configuration** (`src/lib/config/env.ts`)
   - Handles environment variable access with prod-required, test-optional semantics
   - Centralized configuration for OAuth credentials

2. **Client Factories** (`src/lib/integrations/*/factory.ts`)
   - Construct SDK clients at API boundaries
   - Only layer that depends on third-party SDK packages
   - Handles OAuth client configuration

3. **Integration Logic** (`src/lib/integrations/*/sync.ts`)
   - Core business logic for synchronization
   - Depends only on minimal interfaces, not concrete SDK types
   - Fully testable with local mocks

### 2. Minimal Interfaces

Instead of depending directly on third-party SDKs, integration functions accept minimal interfaces:

```typescript
// src/lib/integrations/google-calendar/types.ts
export interface GoogleCalendarClient {
  events: {
    insert(params: {
      calendarId: string;
      requestBody: calendar_v3.Schema$Event;
    }): Promise<{ data: calendar_v3.Schema$Event }>;
    delete(params: { calendarId: string; eventId: string }): Promise<void>;
  };
}

// src/lib/integrations/notion/types.ts
export interface NotionIntegrationClient {
  createPage(params: CreatePageParameters): Promise<CreatePageResponse>;
  updatePage(params: UpdatePageParameters): Promise<UpdatePageResponse>;
  appendBlocks(
    pageId: string,
    blocks: BlockObjectRequest[]
  ): Promise<AppendBlockChildrenResponse>;
  replaceBlocks(
    pageId: string,
    blocks: BlockObjectRequest[]
  ): Promise<AppendBlockChildrenResponse>;
}
```

### 3. Factory Pattern at API Boundaries

Client construction happens at API route boundaries using factory functions:

```typescript
// src/lib/integrations/google-calendar/factory.ts
export function createGoogleCalendarClient(
  tokens: GoogleTokens
): GoogleCalendarClient {
  const clientId = googleOAuthEnv.clientId;
  const clientSecret = googleOAuthEnv.clientSecret;
  const redirectUri = googleOAuthEnv.redirectUri;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Google OAuth environment variables are not configured for this runtime.'
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken ?? undefined,
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  return {
    events: {
      insert: (params) => calendar.events.insert(params as any),
      delete: (params) => calendar.events.delete(params as any).then(() => {}),
    },
  };
}
```

### 4. Environment Variable Semantics

Environment variables use prod-required, test-optional semantics:

```typescript
// src/lib/config/env.ts
const getServerRequiredProdOnly = (key: string): string | undefined => {
  ensureServerRuntime();
  if (!isProdRuntime) {
    return getServerOptional(key); // Allow undefined in dev/test
  }
  if (!serverRequiredCache.has(key)) {
    serverRequiredCache.set(key, requireEnv(key)); // Strict in production
  }
  return serverRequiredCache.get(key)!;
};

export const googleOAuthEnv = {
  get clientId() {
    return getServerRequiredProdOnly('GOOGLE_CLIENT_ID');
  },
  get clientSecret() {
    return getServerRequiredProdOnly('GOOGLE_CLIENT_SECRET');
  },
  get redirectUri() {
    return getServerRequiredProdOnly('GOOGLE_REDIRECT_URI');
  },
} as const;
```

This allows:

- Production: Strict validation, errors on missing credentials
- Development/Test: Optional credentials, uses defaults or mocks

### 5. Centralized Test Environment

Test environment variables are centralized in `tests/setup/test-env.ts`:

```typescript
// tests/setup/test-env.ts
if (!process.env.GOOGLE_CLIENT_ID) {
  process.env.GOOGLE_CLIENT_ID = 'test_google_client_id';
}
if (!process.env.GOOGLE_CLIENT_SECRET) {
  process.env.GOOGLE_CLIENT_SECRET = 'test_google_client_secret';
}
// ... other defaults
```

This eliminates scattered env defaults across test files.

## Testing Strategy

### Unit Tests

Unit tests use local mocks that implement the minimal interfaces:

```typescript
// tests/unit/integrations/google-calendar-sync.spec.ts
let mockCalendar: any;
const createMockCalendarClient = (): GoogleCalendarClient => {
  return mockCalendar as GoogleCalendarClient;
};

beforeEach(() => {
  mockCalendar = {
    events: {
      insert: vi.fn(),
      delete: vi.fn(),
    },
  };
});

// In tests:
const mockClient = createMockCalendarClient();
await syncPlanToGoogleCalendar(planId, mockClient);
```

### Integration Tests

Integration tests also use local mocks instead of global module mocking:

```typescript
// tests/integration/notion-delta-sync.spec.ts
const mockUpdatePage = vi.fn().mockResolvedValue({ id: 'notion_page_123' });
const mockAppendBlocks = vi.fn().mockResolvedValue({});

const createMockNotionClient = (): NotionIntegrationClient => ({
  createPage: vi.fn().mockResolvedValue({ id: 'notion_page_123' }),
  updatePage: mockUpdatePage as any,
  appendBlocks: mockAppendBlocks as any,
  replaceBlocks: vi.fn().mockImplementation(async (pageId, blocks) => {
    await mockAppendBlocks(pageId, blocks);
    return { results: [] };
  }),
});

const mockClient = createMockNotionClient();
const hasChanges = await deltaSyncPlanToNotion(planId, userId, mockClient);
```

### E2E Tests

E2E tests create self-contained mock clients:

```typescript
// tests/e2e/google-calendar-sync-flow.spec.ts
function createMockCalendarClient(): GoogleCalendarClient {
  let eventCounter = 0;
  const createdEvents = new Map<string, calendar_v3.Schema$Event>();

  return {
    events: {
      async insert({ calendarId, requestBody }) {
        eventCounter++;
        const id = `event_${eventCounter}`;
        const event = {
          id,
          summary: requestBody.summary,
          description: requestBody.description,
          start: requestBody.start,
          end: requestBody.end,
        };
        createdEvents.set(id, event);
        return { data: event };
      },
      async delete({ calendarId, eventId }) {
        createdEvents.delete(eventId);
      },
    },
  };
}
```

## Benefits

1. **Improved Testability**
   - Tests don't require real API credentials
   - Fast, isolated tests using local mocks
   - No global module mocking side effects

2. **Better Separation of Concerns**
   - Environment config isolated in one place
   - SDK dependencies confined to factories
   - Business logic free from SDK coupling

3. **Easier Maintenance**
   - SDK version upgrades only affect factory files
   - Tests remain stable across SDK changes
   - Clear boundaries between layers

4. **Production Safety**
   - Strict env validation in production
   - Flexible defaults in development
   - Factory pattern ensures proper client construction

## Migration Guide

When adding a new third-party integration:

1. **Define minimal interface** in `src/lib/integrations/[service]/types.ts`
2. **Create factory function** in `src/lib/integrations/[service]/factory.ts`
3. **Implement integration logic** that accepts the interface in `src/lib/integrations/[service]/sync.ts`
4. **Use factory at API boundary** in route handlers
5. **Write tests with local mocks** that implement the interface
6. **Add test env defaults** to `tests/setup/test-env.ts` (if needed)

## Related Files

- Environment config: `src/lib/config/env.ts`
- Test env defaults: `tests/setup/test-env.ts`
- Google Calendar:
  - Types: `src/lib/integrations/google-calendar/types.ts`
  - Factory: `src/lib/integrations/google-calendar/factory.ts`
  - Sync logic: `src/lib/integrations/google-calendar/sync.ts`
  - API route: `src/app/api/v1/integrations/google-calendar/sync/route.ts`
- Notion:
  - Types: `src/lib/integrations/notion/types.ts`
  - Factory: `src/lib/integrations/notion/factory.ts`
  - Sync logic: `src/lib/integrations/notion/sync.ts`
  - API route: `src/app/api/v1/integrations/notion/export/route.ts`
