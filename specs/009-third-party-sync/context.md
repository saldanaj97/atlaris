## Description

Enable users to export their learning plans to Notion (as pages/databases) and sync to Google Calendar (as scheduled events with reminders). Implement OAuth flows for both services, secure token storage, data mapping, and sync endpoints (both one-off and delta). Add UI actions for triggering exports and enforce tier-based usage gates to prevent abuse.

## Acceptance Criteria

- [ ] Notion OAuth flow implemented with secure token storage (#TBD)
- [ ] Notion export maps learning plan to Notion pages/database with one-off and delta sync (#TBD)
- [ ] Google Calendar OAuth flow implemented with secure token storage (#TBD)
- [ ] Google Calendar sync creates events for tasks/sessions with reminders (#TBD)
- [ ] UI actions added for triggering Notion export and Calendar sync (#TBD)
- [ ] Tier gates enforced: free tier has export limits, paid tiers unlimited (#TBD)
- [ ] Delta sync detects changes and updates only modified content

## Test Outcomes (Plain English)

### Unit Tests

- OAuth token encryption/decryption works correctly
- Notion data mapper converts plan structure to Notion blocks/pages
- Google Calendar event mapper creates correct event format with reminders
- Tier gate logic blocks exports when quota exceeded

### Integration Tests

- Full Notion OAuth flow stores tokens securely in database
- Notion export creates pages/database matching plan structure
- Delta sync detects plan changes and updates Notion accordingly
- Google Calendar sync creates events on user's calendar
- Tier gates prevent free users from exceeding export limits

### E2E Tests

- User connects Notion account, exports plan, verifies Notion pages created
- User connects Google Calendar, syncs plan, sees events on calendar
- User on free tier hits export limit, sees upgrade prompt
- User makes plan changes, delta sync updates Notion/Calendar correctly

## Technical Notes

### Relevant Files/Locations

- `src/app/api/v1/auth/notion/callback/route.ts` - Notion OAuth callback
- `src/app/api/v1/auth/google/callback/route.ts` - Google OAuth callback
- `src/components/plans/ExportButtons.tsx` - UI for export actions
- **Create new:** `src/lib/integrations/notion/` - Notion integration module
- **Create new:** `src/lib/integrations/google-calendar/` - Google Calendar module
- **Create new:** `src/lib/integrations/oauth.ts` - Shared OAuth token management
- `src/lib/db/schema.ts` - Add integration_tokens table for OAuth tokens
- `src/lib/db/usage.ts` - Export usage tracking and tier gates

### Implementation Considerations

- **Security:** Use AES-256 encryption for OAuth tokens (never store plaintext)
- **Notion Mapping:** Map modules to pages, tasks to blocks or database entries
- **Google Calendar:** Create events with start/end times based on schedule
- **Delta Sync:** Track last_synced_at timestamp, compare plan updates
- **Rate Limiting:** Respect API quotas (Notion 3 req/sec, Google Calendar varies)
- **Tier Gates:** free tier = 2 exports/month, starter = 10/month, pro = unlimited
- **Error Handling:** Network failures, revoked tokens, API errors
- **Future Enhancement:** Consider webhook subscriptions for real-time sync

### Dependencies

- Depends on: Plan Structuring feature - needs complete plan data to export
- Depends on: Freemium SaaS feature - needs tier gates implemented

## References

### Context7 MCP Documentation

**Notion API (/llmstxt/developers_notion_llms_txt):**

- OAuth 2.0 token endpoint: `POST /v1/oauth/token` with grant_type, code, redirect_uri
- Refresh tokens available via `refresh_token` grant type
- Database API: Create and query databases, manage properties
- Pages API: Create pages with blocks (text, headings, lists, etc.)
- Blocks API: Append child blocks to pages for content structure
- Rate limit: 3 requests per second
- Notion SDK for JavaScript available (`@notionhq/client`)

**Google Calendar API (/websites/developers_google_workspace_calendar_api):**

- OAuth 2.0 authentication with scopes: `calendar`, `calendar.events`, `calendar.events.owned`
- Events API: Create, read, update, delete calendar events
- Sync tokens: Use `syncToken` parameter for incremental sync (delta updates only)
- Webhooks: Push notifications via Google Channels for real-time change notifications
- Event structure: Supports start/end times, reminders, attendees, descriptions
- Handle 410 "Gone" status for invalid sync tokens (requires full re-sync)

**OAuth 2.0 (/googleapis/google-auth-library-nodejs):**

- Token refresh handling via `tokens` event listener
- Store refresh tokens securely on first authorization (only provided once)
- Access tokens auto-refresh when expired
- Code verifier flow (PKCE) for enhanced security
- Token introspection for validation and metadata

### Web Search Best Practices

**Notion API Integration (2024-2025):**

- Store API keys securely using secret managers (e.g., Google Cloud Secret Manager)
- Monitor API limits; heavy usage can hit rate limits (3 req/sec)
- Document integrations in Notion pages with troubleshooting steps
- Review integrations quarterly to maintain lean system
- OAuth 2.0 for authentication; supports workspace-level integrations
- Core design: Consistency across endpoints, scalability for large data volumes
- **Source:** https://developers.notion.com/docs/getting-started

**Google Calendar API Sync Implementation:**

- OAuth 2.0 for authentication; access and refresh tokens required
- Incremental sync pattern: Use `nextSyncToken` to fetch only latest updates
- Sync tokens incompatible with date bounds; use full sync for filtered queries
- Webhook pattern: Google Channels for real-time change notifications
- Store sync tokens per user to enable continuous syncing without re-consent
- **Sources:** https://www.ensolvers.com/post/implementing-calendar-synchronization-with-google-calendar-api, https://lorisleiva.com/google-calendar-integration/periodic-synchronizations

**OAuth Token Security:**

- Encrypt tokens at rest using AES-256 or similar strong encryption
- Never hardcode credentials or commit to repositories
- Store tokens in secure database with encryption key as environment variable
- For browser/SPA: Store in memory (Web Workers) to prevent XSS attacks
- Revoke tokens when no longer needed; delete permanently
- Automatically renew tokens every 7 days or less
- Use cloud secret managers (AWS KMS, Google Secret Manager) for production
- **Sources:** https://developers.google.com/identity/protocols/oauth2/resources/best-practices, https://auth0.com/docs/secure/security-guidance/data-security/token-storage

**Delta Sync Strategies:**

- Timestamp-based tracking: Store last run timestamp, fetch changes after that time
- Cursor-based tracking: Use lastSuccessfulCursor from API responses
- Delta query with tokens: Service returns @odata.deltaLink for next query
- Base + Delta table pattern: Base table as source of truth, Delta as journal
- Self-recovery: Failed runs catch up on next execution
- Significant bandwidth savings by replicating only changed document parts
- **Sources:** https://docs.valence.app/en/latest/concepts/delta-sync.html, https://docs.aws.amazon.com/appsync/latest/devguide/tutorial-delta-sync.html

---

**Sub-issues have been created to track each implementation area separately.**

## Sub-Issues Overview

### #38 — [Sub Issue] Dynamic Sync: Notion OAuth and Export Implementation

Description: Implement Notion OAuth, secure token storage (AES-256), and export functionality mapping learning plans to Notion pages/databases with one-off and delta sync. Includes rate limiting and error handling.

Acceptance Criteria:

- OAuth 2.0 authorization flow implemented for Notion
- OAuth callback exchanges code for tokens
- Refresh tokens stored encrypted (AES-256) in DB
- Data mapper converts plan → Notion pages/blocks
- One-off export creates complete plan in Notion
- Delta sync updates only modified content
- Respect 3 req/sec Notion rate limit
- Robust error handling (revoked tokens, network, API errors)
- UI button triggers export with proper states

Technical Implementation (key files):

- New: `src/lib/integrations/notion/client.ts`, `mapper.ts`, `sync.ts`
- New: `src/lib/integrations/oauth.ts` (shared token encryption)
- New: `src/app/api/v1/auth/notion/route.ts`, `callback/route.ts`
- New: `src/app/api/v1/integrations/notion/export/route.ts`
- Modified: `src/lib/db/schema.ts` (add `integration_tokens`), `src/components/plans/ExportButtons.tsx`

DB Additions (high-level):

- `integration_tokens`: stores encrypted access/refresh tokens, scope, expires_at
- `notion_sync_state`: links plan ↔ Notion page, tracks `last_synced_at`, `sync_hash`

Tests to Implement:

- Unit: OAuth token exchange/refresh; mapper converts plan → Notion; delta detection; AES-256 encrypt/decrypt
- Integration: OAuth end-to-end; export creates pages; delta updates only changed blocks; token refresh on expiry
- E2E: Connect Notion; export plan; update plan and re-export; handle revoked access gracefully

Notes:

- Use request queue with 3 req/sec and exponential backoff
- Store workspace metadata (workspace_id, workspace_name, bot_id)

### #50 — [Sub Issue] Export usage/tier gates: Enforce on integrations

Description: Apply subscription tier checks and monthly export limits when invoking Notion/Google Calendar integrations.

Acceptance Criteria:

- Export routes check subscription tier and usage counters
- Attempts beyond limits return clear 403 with actionable message
- Usage counters increment on successful exports

Relevant Files/Locations:

- `src/lib/api/gates.ts` — subscription/feature gate helpers
- `src/lib/stripe/usage.ts` — export counters & limits
- `src/app/api/v1/integrations/*` — export route handlers

Implementation Notes:

- Use idempotency keys to avoid double-counting on retries

Tests to Implement:

- Unit: Gate helpers return expected results for each tier
- Integration: Export endpoints reject when over limits; successful export increments usage
- E2E: Free user hits limit and sees upgrade path

### #49 — [Sub Issue] Dynamic Sync: Google Calendar OAuth and Event Sync

Description: Implement Google OAuth, secure token storage, and creation/update of Calendar events for plan tasks, including reminders and timezone handling.

Acceptance Criteria:

- OAuth callback implemented; tokens stored securely
- Create/update events for tasks (title, description, duration) with reminders
- Handle time zones and all‑day vs timed sessions
- UI button triggers sync with clear status

Relevant Files/Locations:

- `src/app/api/v1/auth/google/callback/route.ts` — OAuth callback
- `src/components/plans/ExportButtons.tsx` — UI action
- `src/lib/db/schema.ts` — token storage additions as needed

Implementation Notes:

- Use incremental sync markers (e.g., `syncToken`) to avoid duplication

Tests to Implement:

- Unit: Event payload builder produces expected Calendar API resources
- Integration: OAuth flow completes and tokens persist; events created/updated for sample plan
- E2E: User clicks “Add to Calendar” and sees events in Google Calendar
