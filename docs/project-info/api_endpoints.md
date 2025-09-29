# API Endpoints

This document outlines the API endpoints for the Learning Path App MVP.

Base Path: `/api/v1`

Notes:

- Plan creation & regeneration will be ASYNCHRONOUS: endpoints return `202 Accepted` with `{ planId, status: 'pending' }` and the client polls the plan detail endpoint until `status` becomes `ready` or `failed`.
- Direct plan editing (PUT) is deferred; users regenerate instead of manually editing in MVP.
- Some endpoints below are marked Deferred (scaffold to be added later).

## Core Plan Management

### Create Learning Plan (Async)

- **POST** `/api/v1/plans`
- Create new learning plan (async). Inserts a pending plan and enqueues AI generation.
- Returns: `202 Accepted { planId, status: 'pending' }`
- Body: topic, skill_level, learning_style, weekly_hours, duration_weeks
- When complete, GET plan detail reflects `status: ready` with modules & tasks.

### Get User's Plans

- **GET** `/api/v1/plans`
- Retrieve all learning plans for the authenticated user
- Query params: limit, offset for pagination

### Get Specific Plan

- **GET** `/api/v1/plans/[id]`
- Returns plan metadata: id, title, description, topic, status ('pending' | 'ready' | 'failed')
- When status is 'ready' includes ordered modules, tasks, and progress summary
- When status is 'pending' modules/tasks may be absent (client should poll)

### Update Plan (Deferred)

- **PUT** `/api/v1/plans/[id]`
- Deferred: direct editing not supported in MVP (use regeneration)

- **DELETE** `/api/v1/plans/[id]`
- Permanently delete a learning plan and all associated data

### Regenerate Plan (Async)

- **POST** `/api/v1/plans/[id]/regenerate`
- Triggers async regeneration (status set to pending generation record)
- Body: optional new parameters (subset overrides)
- Returns: `202 Accepted { planId, generationId, status: 'pending' }`

## AI Integration

### Generate Plan Content

- **POST** `/api/v1/ai/generate-plan`
- (Alias / potential preview mode) May remain or merge into POST /plans
- Body: topic, skill_level, learning_style, weekly_hours, duration_weeks

### Enhance Existing Content (Deferred)

- **POST** `/api/v1/ai/enhance-content`
- Enhance or refine existing plan content (e.g. improve descriptions)
- Body: plan_id, enhancement_type

## Progress Tracking

### Get Plan Progress

- **GET** `/api/v1/plans/[planId]/progress`
- Returns completion stats for plan + per-module breakdown

### Update Task Progress (Deferred)

- **POST** `/api/v1/plans/[planId]/tasks/[taskId]/progress`
- Mark task status (not_started | in_progress | completed)
- Body: status

### Update Task Details (Deferred)

- **PUT** `/api/v1/plans/[planId]/tasks/[taskId]/progress`
- Update task progress details
- Body: status, notes, time_spent

## Export & Sync

### Export to Notion

- **POST** `/api/v1/export/notion`
- Export learning plan to user's Notion workspace
- Body: plan_id, notion_workspace_id

### Sync to Google Calendar

- **POST** `/api/v1/export/calendar`
- Create calendar events for plan milestones
- Body: plan_id, calendar_preferences

### Download as CSV

- **GET** `/api/v1/export/csv/[planId]`
- Download plan data as CSV file
- Returns file download

## User Management

### Get User Profile

- **GET** `/api/v1/user/profile`
- Get user profile and subscription status
- Returns user data and plan limits

### Update User Profile

- **PUT** `/api/v1/user/profile`
- Update user profile information
- Body: profile fields to update

### Get Subscription Details

- **GET** `/api/v1/user/subscription`
- Get current subscription and usage details
- Returns subscription tier, limits, usage stats

## Payment & Subscription

### Create Checkout Session

- **POST** `/api/v1/stripe/create-checkout`
- Create Stripe checkout session for subscription upgrade
- Body: price_id, success_url, cancel_url

### Stripe Webhook Handler

- **POST** `/api/v1/stripe/webhook`
- Handle Stripe webhook events (subscription updates, payments)
- Body: Stripe webhook payload

### Create Customer Portal

- **POST** `/api/v1/stripe/create-portal`
- Create Stripe customer portal session for subscription management
- Body: return_url

## Notifications

### Send Weekly Summary

- **POST** `/api/v1/notifications/weekly-summary`
- Trigger weekly progress summary email
- Body: user_id (admin only)

### Get Notification Preferences

- **GET** `/api/v1/notifications/preferences`
- Get user's notification preferences
- Returns email preferences and frequency settings

### Update Notification Preferences

- **PUT** `/api/v1/notifications/preferences`
- Update notification settings
- Body: preference fields to update

## OAuth & Integrations

### Notion OAuth Callback

- **GET** `/api/v1/auth/notion/callback`
- Handle Notion OAuth authorization callback
- Query params: code, state

### Google OAuth Callback

- **GET** `/api/v1/auth/google/callback`
- Handle Google Calendar OAuth authorization callback
- Query params: code, state

### Disconnect Integration

- **POST** `/api/v1/integrations/disconnect`
- Disconnect third-party integration
- Body: integration_type (notion, google)

## Content Management

### Get Learning Resources

- **GET** `/api/v1/resources`
- Get available learning resources
- Query params: type, topic for filtering

### Get Plan Templates

- **GET** `/api/v1/templates`
- Get available plan templates (future feature)
- Query params: category, skill_level

## Authentication & Authorization

All endpoints require authentication via Clerk middleware except:

- Stripe webhook handler (verified via signature)
- OAuth callbacks (handled by respective providers)

Async Generation Status Codes (Plan / Regeneration):

- 202 Accepted: Plan or regeneration accepted and pending.
- 200 OK: Returned entity ready (status='ready').
- 500/Failed: status='failed' with error details (redacted).

### Rate Limiting

- Free tier: 10 requests/minute
- Pro tier: 100 requests/minute
- Enterprise: 1000 requests/minute

### Error Responses

All endpoints return consistent error format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": "Additional details"
}
```

### Success Responses

All endpoints return data in consistent format:

```json
{
  "data": "Response data",
  "meta": "Pagination/additional metadata"
}
```
