# Atlaris Landing Page — Build Spec (v1)

## 0) Product Positioning (Non-negotiable)

- **Primary promise:** Turn “I want to learn X” into a **time-blocked calendar schedule** with **linked resources**.
- **Positioning sentence:** _“If it’s not on your calendar, it doesn’t exist.”_
- **Success metric for page:** In <5 seconds, user understands: **Input → schedule → synced calendar** (not “AI roadmap”).

---

## 1) Page Goals, KPIs, Non-goals

### Goals

1. Communicate differentiation: **execution via calendar scheduling**.
2. Convert to “Build My Schedule” (email capture or auth).
3. Establish credibility via UI-first visuals + grounded copy.

### KPIs

- CTA click-through rate (hero + footer)
- Scroll depth to “How it Works”
- Conversion rate to onboarding (start schedule build)

### Non-goals

- Explaining AI internals
- Blog content / SEO hub
- Stock-photo emotional branding

---

## 2) Information Architecture (Single page)

1. **Nav**
2. **Hero (H1 + H2 + primary CTA + hero visual split)**
3. **Problem vs Solution (2-column contrast)**
4. **How it Works (3 steps)**
5. **Use Cases / Social Proof**
6. **Final CTA**
7. **Footer**

---

## 3) Copy (Final Draft)

### Nav

- Left: Logo + “Atlaris”
- Right links: How it Works, Pricing, Log In
- Primary button: **Build My Schedule**

### Hero

- H1: **Your learning plan isn’t the problem. Your calendar is.**
- H2: **Atlaris turns what you want to learn into a time-blocked, resource-linked schedule that syncs directly to Google Calendar, Notion, or Outlook.**
- Primary CTA: **Build My Schedule →**
- Subtext: **Free. Takes about 60 seconds. No credit card.**

### Problem/Solution

- Section headline: **Most people don’t fail to learn. They fail to start consistently.**
- Left card title: **The Manual Spiral**
  - Bullets:
    - Endless “best resources” searches
    - Conflicting advice
    - Plans that never touch your calendar
    - Motivation dies by week two

- Right card title: **Execution, Scheduled**
  - Bullets:
    - One coherent roadmap
    - Time-blocked into your real week
    - Resources attached to each session
    - Progress you can actually see

### How it Works

- Headline: **How Atlaris forces progress**
- Step 1:
  - Title: **1. Curriculum that respects reality**
  - Copy: **AI structures what to learn—and what to ignore—into clear milestones with time estimates.**

- Step 2:
  - Title: **2. Resources chosen, not dumped**
  - Copy: **Each session includes one best resource. One task. One outcome.**

- Step 3:
  - Title: **3. Sync to your real life**
  - Copy: **If it’s not on your calendar, it doesn’t exist. Export with one click.**

### Use Cases

- Headline: **Built for people with limited time—not infinite motivation**
- Cards:
  1. **Career Switcher:** “I had 30 minutes a day. This gave me a plan that didn’t lie to me.”
  2. **Student:** “It replaced my messy study schedule with something I actually followed.”
  3. **Busy Professional:** “I stopped thinking about learning and just showed up to it.”

### Final CTA

- Headline: **You don’t need more motivation. You need a schedule.**
- Subhead: **Tell us what you want to learn. We’ll tell you when to do it.**
- CTA: **Generate My Schedule Now →**
- Subtext: **Free. Cancel anytime.**

---

## 4) Visual Requirements (UI is the marketing)

### Hero Visual (Required)

A single hero “device card” containing a **3-part split**:

1. **Input panel** (left): goal, experience, availability, timeline
2. **Transformation indicator** (center): “Structuring → Selecting resources → Scheduling”
3. **Calendar week view** (right, dominant): time blocks with labels + “Synced ✓ Created 12 seconds ago”

**Must feel like a real product UI** (not illustration).

### Additional Visuals

- Problem section: “messy tabs + empty calendar” (stylized mock image)
- Step visuals:
  1. Notion-style outline (modules + time estimates)
  2. Calendar event expanded showing resource link + objective
  3. Integration row (logos) + “Sync successful” toast/lock-screen reminder

---

## 5) Component Spec

### Global Layout

- Max content width: 1120–1200px
- Section vertical padding: 80–120px desktop, 56–80px mobile
- Use cards with subtle border + tight shadow.

### Navigation

- Sticky optional (recommended)
- Desktop: inline links + CTA button
- Mobile: hamburger menu with CTA pinned at top or bottom

### Buttons

- Primary: filled (deep teal / slate blue)
- Secondary: ghost or outline (Log In)
- Focus states: visible, accessible

### Hero Section

- Left: text stack + CTA
- Right: hero visual card (responsive scales)
- Mobile: text then hero visual

### Problem/Solution

- Two equal cards with icons
- Left “messy” card has slightly warmer warning accent (used sparingly)
- Right “clean” card uses success accent (used sparingly)

### How It Works

- 3 rows or 3 stacked blocks
- Each: step number + title + 1–2 sentences + visual
- Step 3 gets slightly larger emphasis (killer feature)

### Social Proof

- 3 cards; each includes persona label + quote
- Optional: small “time constraint” badge (e.g., “30 min/day”)

### Footer

- Minimal links: Privacy, Terms, Contact
- Small one-liner reiterating scheduling promise

---

## 6) Design Tokens (Style Guide)

### Typography

- Font: Inter (fallback: system-ui)
- H1: 48–56px desktop, 34–40px mobile; weight 600–700
- H2: 18–20px; weight 400–500
- Body: 16–18px

### Color Palette (example targets; adjust to your brand)

- Background: warm off-white / cream
- Text: charcoal (not pure black)
- Primary CTA: deep teal or slate blue
- Accent:
  - Success (sync/check): muted green
  - Highlight (sparingly): warm amber

### Borders/Shadows

- Borders: 1px subtle neutral
- Shadow: soft, tight, low elevation (avoid floaty glow)

### Imagery Rules

- Only UI screenshots / UI-styled mockups / calendar views
- No neural nets, no gradients-as-meaning, no stock people

---

## 7) Responsive + Accessibility

### Responsive Behavior

- Mobile order: Nav → Hero text → CTA → Hero visual → rest
- Hero visual becomes single-column stacked if needed:
  - Input panel on top, calendar beneath

### Accessibility

- Minimum contrast AA
- Visible keyboard focus
- Buttons have aria-labels where needed
- Headings follow semantic order (H1 once)

---

## 8) Performance + SEO

### Performance

- Images: optimized, lazy load below fold
- Hero image: preload
- Avoid heavy animation libraries; use CSS transitions

### SEO

- Title: “Atlaris — Turn learning goals into a scheduled plan”
- Meta description: emphasize time-blocked schedule + sync
- OpenGraph: hero split visual
- Structured data optional (Organization / SoftwareApplication)

---

## 9) Analytics Events (Minimum)

- `cta_click` with location: `nav`, `hero`, `footer`
- `section_view` for `how_it_works`
- `pricing_click`
- `login_click`

---

## 10) Implementation Notes (Suggested Stack)

- Next.js + Tailwind
- Component library optional (shadcn/ui style)
- Keep landing page static (fast), CTA routes to onboarding

---

# Lovable-Ready Prompt (Paste as-is)

Build a single-page landing page for an AI web app named “Atlaris” that generates custom learning roadmaps and, critically, turns them into a time-blocked schedule that syncs to Google Calendar/Notion/Outlook. Style: anti-magic, high-end productivity tool (Linear/Notion/Superhuman vibe). Background off-white/cream, text charcoal, primary CTA deep teal or slate blue, subtle borders and tight soft shadows. No sci-fi AI imagery; only UI screenshots/mock UI.

Sections:

1. Minimal nav: logo+Atlaris on left; links How it Works, Pricing, Log In; primary button “Build My Schedule”.
2. Hero: H1 “Your learning plan isn’t the problem. Your calendar is.” H2 “Atlaris turns what you want to learn into a time-blocked, resource-linked schedule that syncs directly to Google Calendar, Notion, or Outlook.” Primary CTA “Build My Schedule →” with subtext “Free. Takes about 60 seconds. No credit card.” Hero visual: a single card showing a 3-part split—left input panel (Goal, Experience, Availability, Timeline), center progress indicator (“Structuring → Selecting resources → Scheduling”), right dominant calendar week view with time blocks and a “Synced ✓ Created 12 seconds ago” label.
3. Problem vs solution section: headline “Most people don’t fail to learn. They fail to start consistently.” Two cards: “The Manual Spiral” (endless searches, conflicting advice, plans never hit calendar, motivation dies by week two) vs “Execution, Scheduled” (coherent roadmap, time-blocked, resources attached, progress visible).
4. How it works: headline “How Atlaris forces progress” with 3 steps: 1) Curriculum that respects reality 2) Resources chosen, not dumped 3) Sync to your real life (emphasize this step). Include UI-style visuals for each: Notion-like outline, expanded calendar event with resource link, integrations row + sync toast/lock screen.
5. Use cases: headline “Built for people with limited time—not infinite motivation” with 3 quote cards (Career Switcher, Student, Busy Professional).
6. Final CTA: headline “You don’t need more motivation. You need a schedule.” subhead “Tell us what you want to learn. We’ll tell you when to do it.” CTA “Generate My Schedule Now →” subtext “Free. Cancel anytime.”
7. Footer: Privacy, Terms, Contact.

Make it responsive, accessible (AA contrast, visible focus states), fast (optimized images, minimal JS). Add basic analytics hooks for CTA clicks (nav/hero/footer).

---

If you want this spec to reflect your actual app name (instead of Atlaris) and your real UI screenshots instead of placeholders, provide the name and 2–3 screenshots; otherwise the build should use polished mock UI blocks consistent with the described layout.
