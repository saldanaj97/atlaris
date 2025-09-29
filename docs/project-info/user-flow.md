# End-to-End User Flow (MVP)

## 1. **Landing / Entry Point**

- User arrives at the platform (web app).
- Options:
  - **Sign Up / Log In** (Google, GitHub, email) → saves their plans.
  - **Try Without Account** (limited, free) → encourages conversion later.

---

## 2. **Plan Creation Wizard**

### Step 1 – Topic Input

- User enters: “Learn Swift for iOS development.”
- (Optional) Quick suggestions pop up (e.g., “Swift basics,” “SwiftUI,” “iOS app deployment”).

### Step 2 – Personalization

- Prompt for:
  - **Skill level** (Beginner / Intermediate / Advanced).
  - **Weekly time available** (slider or numeric, e.g., 5 hrs).
  - **Deadline** (optional date).
  - **Learning style preference** (Video / Text / Hands-on / Mixed).

**System response**:

- Stores preferences.
- Passes to AI planner for roadmap generation.

---

## 3. **Roadmap Generation**

- System generates:
  - **Milestones (weekly breakdowns)**
  - **Tasks (daily or per session)** with time estimates
  - **Resource links** (YouTube, docs, exercises, projects)

**User sees**:

- A preview of their roadmap.
- Example:
  - **Week 1** → Install Xcode, Swift basics, Optionals.
  - **Week 2** → SwiftUI fundamentals, build first app.

**Options**:

- Accept roadmap as-is.
- Regenerate (if premium, allows customizing # of weeks, more/less intensive).

---

## 4. **Export & Sync**

**Free user**:

- Can export **static roadmap** to Notion (no updates, just a template).

**Premium user**:

- Can sync **dynamically**:
  - **Notion API**: Updates tasks/milestones automatically.
  - **Google Calendar API**: Creates scheduled events for each task based on time inputs + deadline.

**System handles**:

- Calendar event pacing (if user said 5 hrs/week → system distributes tasks accordingly).
- Notion database creation with linked tasks, deadlines, and progress checkboxes.

---

## 5. **Progress Tracking (Basic MVP)**

- In-app dashboard shows:
  - Current milestone.
  - Upcoming tasks.
  - Completion % (check off tasks).

**Premium enhancement later**: Sync back progress from Notion/Calendar → update dashboard automatically.

---

## 6. **Retention Loop**

- **Reminders**: Weekly email summary (“This week: SwiftUI basics, build first app”).
- **Upsell**: If on free plan, nudge when roadmap runs out or when they try to resync.

---

## ⚡ Example Flow in Action

1. Juan signs up with Google.
2. Types in: _“Learn Swift for iOS Development.”_
3. Selects: Beginner, 5 hrs/week, deadline = 8 weeks, prefers hands-on.
4. Platform generates: 8-week roadmap with coding exercises, linked Swift Playgrounds, and a final capstone project.
5. Juan accepts plan.
6. Exports:
   - Notion → gets a full task database.
   - Google Calendar → weekly sessions automatically scheduled.

7. Each week Juan gets an email: _“Week 3 focus: SwiftUI basics, 3 tasks due this week.”_

---

This flow gives a **clear MVP funnel**:

- **Input → Personalization → Plan → Export/Sync → Retention**

---
