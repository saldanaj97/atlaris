# User Preferences

**Audience:** Developers changing settings, AI model defaults, email opt-ins, or analytics timezone.  
**Last Updated:** September 2026

Preferences live in dedicated tables (not on `users`). Auth actor loading joins `user_preferences`; missing tables during cutover fail actor resolution — see [deploy.md](../development/deploy.md) for migration order.

## Tables

| Table                                 | Role                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `user_preferences`                    | `preferred_ai_model`, `preferred_regeneration_ai_model`, `preferred_lesson_ai_model` (nullable text), `analytics_timezone` (default `UTC`) |
| `user_email_notification_settings`    | `unsubscribe_all_optional_emails` (default `false`)                                                                                        |
| `user_email_notification_preferences` | Per-category `enabled` + optional `unsubscribed_at`; PK `(user_id, category)`                                                              |

Schema: `supabase/schema/tables/user-preferences.ts`. Queries: `src/lib/db/queries/user-preferences.ts`.

### Email categories

Enum `email_notification_category`:

| DB value          | Form field       | Delivery run |
| ----------------- | ---------------- | ------------ |
| `weekly_summary`  | `weeklySummary`  | Weekly cron  |
| `daily_reminder`  | `dailyReminder`  | Daily cron   |
| `streak_reminder` | `streakReminder` | Daily cron   |

Defaults (`DEFAULT_EMAIL_NOTIFICATION_PREFERENCES` in `src/shared/notifications/email-preferences.ts`): all categories **off** (opt-in). Effective send eligibility: category enabled **and** `unsubscribe_all_optional_emails` is false (`resolveEffectiveEmailPreferences`).

Ops delivery runbook: [email-notification-delivery-runbook.md](./email-notification-delivery-runbook.md).

### RLS

- Preference / notification tables: authenticated own-row `select` / `insert` / `update` with column grants (see `supabase/privileges/user-preferences-authenticated-columns.ts`).
- Delivery ledger tables are service-role only (deny-all RLS) — not user-writable.

## Settings ledger UI

`/settings` is a single page (`SettingsLedgerPage`) with hash sections (`settings-section-ids.ts`):

| Hash             | Section                                      |
| ---------------- | -------------------------------------------- |
| `#profile`       | Profile form                                 |
| `#billing`       | Plan & billing (DB snapshot + checkout sync) |
| `#usage`         | Billing meters (not learning analytics)      |
| `#ai`            | AI model preference                          |
| `#integrations`  | Integrations                                 |
| `#notifications` | Email notification preferences               |

Deep links: `/settings#notifications`, `/settings?checkout=1&checkoutBaseline=...#billing`. Scroll targeting: `SettingsScrollTarget`.

## API contracts

### AI model preference

| Method  | Path                       | Body / response                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/api/v1/user/preferences` | Raw saved slots (`preferredAiModel`, `preferredRegenerationAiModel`, `preferredLessonAiModel`, each nullable, including out-of-tier IDs) plus `effectivePreferredAiModel` / `effectivePreferredRegenerationAiModel` / `effectivePreferredLessonAiModel` (resolved for the current tier × operation, never written) and `availableModels` (persistable outline picker list; Free is `[]`). Does not return timezone or email prefs |
| `PATCH` | `/api/v1/user/preferences` | One or more of `{ preferredAiModel, preferredRegenerationAiModel, preferredLessonAiModel }` as `string \| null`. Validated against the current tier × operation policy, not the PostgreSQL enum. `null` clears that slot. Free rejects any non-null save (`403 MODEL_NOT_ALLOWED_FOR_TIER`). Starter may save only the outline slot. Pro may save all three independently                                                         |

UI: Settings `#ai` → `ModelSelectionCard` → `ModelPreferencesSelector` → `useModelPreferenceSave` → PATCH, then `router.refresh()`. Free has no picker and does not PATCH on render.

### Email notification preferences

| Method  | Path                                     | Body                                                                             |
| ------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| `PATCH` | `/api/v1/user/preferences/notifications` | `{ unsubscribeAllOptionalEmails, weeklySummary, dailyReminder, streakReminder }` |

No public GET route; Settings `#notifications` loads prefs server-side via `getEmailNotificationPreferences`. Saving upserts the settings row and all three category rows; disabling a previously enabled category sets `unsubscribed_at`.

### Analytics timezone

Stored on `user_preferences.analytics_timezone`. Updated by:

- `UsageAnalyticsTimezoneSync` on `/analytics/usage` (server action)
- Optional `analyticsTimezone` on `PUT /api/v1/user/profile`

See [usage-analytics-metric-contract.md](./usage-analytics-metric-contract.md).

### One-click unsubscribe

| Method | Path                                                                                       | Behavior                                                                                |
| ------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `GET`  | `/api/v1/notifications/email/unsubscribe?token=...`                                        | Confirmation HTML only — **never mutates** (anti-prefetch)                              |
| `POST` | same + exactly one `multipart/form-data` or URL-encoded field `List-Unsubscribe=One-Click` | Sets `unsubscribe_all_optional_emails = true` via service role; category rows unchanged |

Token: HMAC payload with purpose `email_unsubscribe_all` (`src/features/notifications/email/unsubscribe-token.ts`).

## Feature flags (related)

Declared in `src/flags.ts`. Preference tables and Settings opt-ins are **not** feature flags. These three keys stay Vercel-backed operational kill switches — they do not move to PostHog. Future user/cohort/experiment/percentage product rollouts belong in PostHog; do not add `@flags-sdk/posthog` for these controls. Ownership rule and env/scheduler inventory: [environment.md — Flag and gate ownership](../development/environment.md#flag-and-gate-ownership). Fail-open/fail-closed table: [environment.md — Vercel Flags](../development/environment.md#vercel-flags).

| Flag key                      | Default               | Role                                                             |
| ----------------------------- | --------------------- | ---------------------------------------------------------------- |
| `email-notification-delivery` | `false` (fail-closed) | Cron / maintenance / workflow must not send when off             |
| `maintenance-mode`            | fallback `false`      | Proxy routes app traffic to maintenance                          |
| `module-lesson-generation`    | `false` (fail-closed) | Module lesson batches (sync + workflow); not a preference toggle |

Without `FLAGS` (typical local), adapters use the flag `defaultValue` / fallback — email delivery and lesson generation stay off until enabled in a Vercel environment with Flags configured.

## Pitfalls

1. Do not write preference columns on `users` — they were dropped; use `user_preferences`.
2. Settings `#usage` is **billing** meters; learning analytics live at `/analytics/usage`.
3. Master “unsubscribe from optional emails” disables category switches in the UI without rewriting stored category booleans until save.
4. Actor load joins preferences — apply preference migrations before app code that requires the join ([deploy.md](../development/deploy.md)).

## Related docs

- [clerk-billing-architecture.md](./clerk-billing-architecture.md)
- [email-notification-delivery-runbook.md](./email-notification-delivery-runbook.md)
- [schema-overview.md](../database/schema-overview.md)
- [environment.md](../development/environment.md)
