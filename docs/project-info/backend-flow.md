# Backend Workflow for MVP

## 1. **User Authentication & Accounts**

- **Input**: User signs up (Google OAuth, GitHub, or email).
- **Process**:
  - Auth handled by **Supabase Auth** (or Clerk/Auth0 if you prefer).
  - User profile stored in DB (`users` table).

- **Output**: Session token (JWT) → user authorized to create plans.

## 2. **Plan Creation**

### Input

- Topic (e.g., “Swift for iOS Development”).
- Skill level, weekly time, deadline, learning style.

### Process

1. **Store plan metadata** in DB (`plans` table).

   ```json
   {
     "user_id": "123",
     "topic": "Swift for iOS Development",
     "skill_level": "Beginner",
     "weekly_time": 5,
     "deadline": "2025-11-01",
     "learning_style": "Hands-on"
   }
   ```

2. **AI Planner Service**:
   - API request to **OpenAI (GPT-5)** or fine-tuned model.
   - Prompt injects: topic + user inputs → returns structured roadmap.

   Example response format:

   ```json
   {
     "weeks": [
       {
         "week": 1,
         "milestone": "Swift basics",
         "tasks": [
           {
             "day": 1,
             "task": "Install Xcode",
             "duration": 1,
             "resource": "https://apple.com/..."
           },
           {
             "day": 2,
             "task": "Learn Swift syntax",
             "duration": 2,
             "resource": "https://swift.org/..."
           }
         ]
       }
     ]
   }
   ```

3. **DB Storage**: Persist roadmap in `milestones` and `tasks` tables linked to the plan.

### Output

- Roadmap JSON → frontend for preview.

---

## 3. **Export / Sync Services**

### A. Notion Export

- **Trigger**: User clicks “Export to Notion.”
- **Process**:
  - OAuth handshake with Notion API.
  - System builds Notion **database schema** (columns: Task, Due Date, Status, Resource Link).
  - Pushes tasks in bulk via Notion API.

- **Output**: Roadmap appears in Notion workspace.

---

### B. Google Calendar Sync

- **Trigger**: User clicks “Sync to Google Calendar.”
- **Process**:
  - OAuth handshake with Google Calendar API.
  - Calculate event timings based on `weekly_time` + `deadline`.
  - Create events with descriptions, links, and reminders.

- **Output**: Events scheduled in user’s calendar.

---

## 4. **Progress Tracking**

- **Free version**: Track progress in app only.
  - User checks off tasks → update `tasks` table (`status = completed`).

- **Premium version**:
  - System listens to Notion/Calendar webhooks.
  - Updates DB when task completed externally.

- **Output**: Dashboard completion % and reminders.

---

## 5. **Retention / Notifications**

- **Weekly Summary Job** (Cron/Serverless):
  - Query tasks due this week per user.
  - Generate personalized email (SendGrid/Resend).

- **Output**: Weekly learning nudges → boosts retention.

---

## Suggested Tech Stack (Backend)

- **Framework**: Next.js API routes (serverless functions).
- **Database**: Supabase (Postgres + Auth + Realtime).
- **AI Service**: OpenAI API (GPT-5) with structured prompting.
- **Integrations**:
  - Notion API (task export).
  - Google Calendar API (event creation).
  - Stripe API (freemium gating).

- **Job Scheduler**: Supabase Functions or Cron (for email summaries).

---

## Data Flow Example

1. User → `/api/create-plan` → DB insert → OpenAI API call → roadmap JSON → save to DB → return to frontend.
2. User → “Export to Notion” → `/api/export/notion` → OAuth → push tasks to Notion → success response.
3. Weekly cron → `/api/notify-weekly` → query tasks due → send email → log in `notifications` table.

---
