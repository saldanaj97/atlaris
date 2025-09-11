# **Project Design Brief – Personalized Learning Path Generator**

## **Overview**

This project is a **freemium SaaS platform** that helps users create **personalized learning plans** for any topic they want to master. Users simply enter what they want to learn (e.g., “Swift for iOS development”), provide a few key inputs about their skill level, time availability, and preferred learning style, and the platform generates a structured, actionable roadmap.

The output plan is **dynamic** (updates if user preferences or progress change) and can be **exported or synced** into productivity tools like Notion, Google Calendar, or Todoist.

Our MVP scope focuses on creating a smooth, guided workflow for users to generate and access their learning plans, while leaving room for future scalability.

### **Target User**

- **Primary**: Students, professionals, or hobbyists who want structured learning without having to research and plan themselves.
- **Secondary**: Professionals upskilling in tech or new tools.

---

### **Key Features (MVP)**

1. **Guided Onboarding Form**
   - User inputs:
     - Topic (free text, e.g., “Learn SQL basics”)
     - Skill level (Beginner / Intermediate / Advanced)
     - Weekly available time (numeric input, e.g., “5 hours per week”)
     - Preferred learning style (Reading, Video, Hands-on practice)

   - Outputs to backend for plan generation.

2. **Learning Path Generation**
   - AI/Algorithm generates a structured plan with:
     - Modules/steps (e.g., “Week 1: Introduction to X”)
     - Suggested resources (YouTube, docs, MOOCs, etc.)
     - Estimated time for each module.

   - Progression logic ensures paths adapt to input (shorter, beginner-friendly, or advanced).

3. **Plan Management & Access**
   - View generated plan inside the web app.
   - Sync/export options (Notion template, Google Calendar events, CSV download).
   - Option to “regenerate” or “tweak” if user changes inputs.

4. **Freemium SaaS Structure**
   - Free: Limited number of generated plans.
   - Paid: Unlimited plans, advanced customization, and deeper integrations (future scope).

---

### **User Flows**

#### **1. New User Onboarding**

- User lands on homepage.
- Clicks **“Create a Plan”** → Taken to onboarding form.
- Fills in topic, skill level, weekly hours, and learning style.
- Clicks **“Generate Plan.”**

#### **2. Plan Generation**

- Backend processes inputs.
- Plan is displayed as structured modules (e.g., “Week 1: Fundamentals”) with resources attached.
- User can:
  - Scroll through the full roadmap.
  - Expand/collapse modules for details.
  - Mark modules as complete (future scope).

#### **3. Export/Sync**

- From plan view, user can choose:
  - Export to Notion (auto-populated template).
  - Sync to Google Calendar (modules as events).
  - Download as CSV.

#### **4. Return Users**

- Users log in.
- Dashboard displays past plans.
- Option to create new plan, tweak existing ones, or track progress.

---

### **Tone and Design Direction**

- Clean, minimal interface to reduce friction.
- Emphasis on clarity: modules, steps, and progress should be visually easy to follow.
- Dynamic feel: users should feel like the app adapts to them, not the other way around.
- Export/sync flows should feel lightweight and seamless.

---

### **Deliverables Needed from Design Partner**

- **User flow diagrams** (based on flows above).
- **Wireframes** for:
  - Homepage / Landing.
  - Onboarding form.
  - Plan results page.
  - Export/sync modal.
  - Dashboard (basic, for return users).

- **UI designs**: polished screens with typography, color system, and button states.
- **Responsive layouts** (desktop first, mobile-friendly optional for MVP).

---
