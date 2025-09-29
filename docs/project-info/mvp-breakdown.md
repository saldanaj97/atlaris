# MVP Breakdown

## 1. **User Input (Onboarding Form)**

- **Required**:
  - Topic (free text: “Swift for iOS Development”)

- **Optional but highly valuable**:
  - Current skill level (beginner / intermediate / advanced)
  - Weekly time available (e.g., 5 hrs/week)
  - Preferred learning style (video, text, hands-on projects)
  - Deadline (if applicable: “6 weeks”)

This makes the plan feel tailored, not generic.

---

## 2. **Content Engine (Hybrid Curation + AI Generation)**

- **Curation**: Pull from existing trusted sources (YouTube playlists, documentation, free MOOCs, GitHub repos, blogs).
- **AI Layer**:
  - Break content into **milestones** (week 1: basics, week 2: build project, etc.).
  - Fill gaps with AI-generated micro-explanations, summaries, or exercises.
  - Adjust pacing based on weekly time input + deadline.

For the MVP, narrow down to **programming/tech topics** (easier because content sources are abundant and structured). Expansion to general topics can come later.

---

## 3. **Plan Structuring**

- Convert topic into a **roadmap**:
  - Week-based milestones
  - Daily or session-based tasks
  - Each task links to resources and has an estimated time cost

Example:
**Week 1**

- Day 1: Install Xcode + set up environment (1h)
- Day 2: Swift basics (video + exercises, 2h)
- Day 3: Swift optionals + structs (docs + quiz, 1h)

---

## 4. **Dynamic Sync (Key Differentiator)**

- **Notion Export**: Create a Notion database template with milestones/tasks.
- **Google Calendar Sync**: Push tasks as events with reminders based on time commitment.
- **Other Integrations (later)**: Todoist, Trello, Asana, etc.

For MVP, just **Notion + Google Calendar** keeps it attractive but feasible.

---

## 5. **Freemium SaaS Model**

- **Free tier**:
  - Generate a basic roadmap with up to 2 weeks of tasks.
  - Export to Notion (static, not synced).

- **Premium tier**:
  - Full roadmap with dynamic sync to Google Calendar + Notion.
  - Ability to regenerate/customize plans.
  - Priority topic support (e.g., “Kubernetes,” “SwiftUI,” etc.).

---

## Technical Architecture (MVP-level)

### Frontend

- **Framework**: Next.js (React-based, good for SaaS, SEO-ready).
- **UI**: Tailwind + shadcn/ui (fast, clean, modern).

### Backend

- **API Layer**: Node/Express (or Next.js API routes).
- **Database**: Supabase (easy auth + data storage, scales later).
- **AI Engine**: OpenAI API (task breakdown, summaries).

### Integrations

- **Notion API** (export structured roadmap).
- **Google Calendar API** (sync tasks/events).

---

## MVP Roadmap (Step-by-Step)

1. **Phase 1 – Core Flow**
   - User inputs topic → AI generates roadmap → roadmap displayed in-app.

2. **Phase 2 – Export/Sync**
   - One-click Notion export.
   - One-click Google Calendar sync.

3. **Phase 3 – SaaS Wrapper**
   - Auth (Supabase or Clerk).
   - Freemium gating (Stripe).

---

To keep velocity high, I’d recommend:

- Narrowing to **programming/tech topics** for MVP.
- Building only **Notion + Google Calendar sync** first.
- Making personalization light-touch (just those 3 inputs).

---
