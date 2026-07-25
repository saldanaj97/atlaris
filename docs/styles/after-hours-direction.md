# After Hours — approved product direction

**Status:** **Live.** Semantic CSS vars, typography, marketing surfaces, navigation, and core product pages follow After Hours.

**Decision date:** 2026-07-18
**Exploration reference:** Cursor canvas `theme-after-hours-site.canvas.tsx` (full-site mocks: Landing, Pricing, Dashboard, Plans, Analytics, Settings, Achievements)

---

## Brand story

**After Hours** = atlas + Polaris: custom maps and guides for learning. Velvet nocturne (dark) or celestial parchment (light). Warm peach/copper accent against plum ink.

---

## Experience

The lived "vibe" behind the tokens. Read this before writing marketing UI or copy; the sections below it (Typography, Color, Surface) are the locked implementation.

### Experience thesis

Atlaris is a celestial atlas for learning: it guides you through the night sky of a goal, holding a steady route through the quiet hours so ambition survives busy weeks.

### Metaphor system

One coherent metaphor — navigation by night sky. Every named concept maps to a product idea:


| Metaphor                      | Product meaning                                       | Where it's live                           |
| ----------------------------- | ----------------------------------------------------- | ----------------------------------------- |
| **Atlas**                     | The product itself: custom maps and guides            | Brand name, wordmark                      |
| **Star / "set your star"**    | The learning goal you name at setup                   | `RouteSection` stop I                     |
| **Route / course**            | The generated week-by-week plan                       | `RouteSection`, "Atlaris holds the route" |
| **Drift**                     | The failure mode — abandonment, not lack of ambition  | `DriftSection`                            |
| **Polaris**                   | The fixed point; commitment that doesn't move         | `PolarisSection` (inverted band)          |
| **Instruments**               | The working tools: plan detail, analytics             | `InstrumentsSection`                      |
| **Bearings / sky filling in** | Progress tracking; finished tasks become fixed points | `RouteSection` stop III, analytics copy   |
| **Quiet hours / after hours** | The user's real study time — evenings, 9pm–11pm       | Hero subheadline, `QuestionsSection`      |
| **"Make space"**              | The core promise: room for the work that changes you  | Hero headline                             |


### Emotional register

**Feels like:** a lamplit desk at 10pm; a navigator who already charted tonight's leg; calm certainty; patience (the plan waits, nothing expires or punishes).

**Does not feel like:** hustle-SaaS urgency, streak shaming, gamified pressure, productivity bravado, or a cold sci-fi dashboard.

### Voice & copy

Sora is the brand voice (see Typography below). Tone: quiet, assured, second person, short declarative sentences — often a plain lead line with an italic emphasis turn ("Ambition isn't your problem. *Drift is.*"). Copy acknowledges failure gently and without blame ("one busy Thursday, and the map goes dark").

CTA language stays inside the metaphor and the time of day: **"Begin tonight"**, "See pricing", "Chart your course", "Start free tonight". Never generic growth-speak: no "Get started free", "Boost your learning", "Supercharge", no exclamation points.

### Spatial choreography

Landing (`Landing.tsx`) is a single narrative arc: **Hero** (make space) → **Drift** (name the failure) → **Route** (three moves, constellation line) → **Instruments** (proof: plan + analytics) → **Questions** ("Asked at 11pm, answered here") → **Polaris** (commitment + CTA). Pacing comes from hairline dividers, generous vertical rhythm, and staggered fade/slide reveals (always `motion-reduce` safe). Polaris is the one inverted band (`bg-foreground` / `text-background` + `StarField`) — keep it unique; don't add a second inverted section.

Pricing continues the story: "Chart your course" / "One sky. Three ways to cross it." — tiers are ways across the same sky, not a feature-war grid.

### Product vs marketing

Same story, different density. Marketing tells the story out loud (Sora, celestial backdrop, narrative sections). Product **is** the instrument: quiet, dense, operational Work Sans UI — no orbs, no hero type, no metaphor-heavy copy in dashboards. See "Design contexts (do not mix)" in `[style-guide.md](./style-guide.md)`.

### Anti-patterns

Beyond the Do/don't list below: no Progress Jam violet, no liquid-glass or glass shells, no cold cyan orbs, no purple-on-white AI-gradient slop, no hustle/urgency copy, no countdown or scarcity mechanics, no breaking the night-sky metaphor with mixed metaphors (gyms, rockets, races).

### Canonical copy anchors

Real copy lives in code — quote from these, don't re-invent:

- `src/app/(marketing)/landing/components/HeroSection.tsx` — hero headline, subheadline, CTA labels
- `src/app/(marketing)/landing/components/DriftSection.tsx`, `RouteSection.tsx`, `InstrumentsSection.tsx`, `QuestionsSection.tsx`, `PolarisSection.tsx` — section copy
- `src/app/(marketing)/pricing/components/PricingShell.tsx` — pricing hero copy

### Visual translation

The vibe lands through the locked specs in this file: Typography (Sora vs Work Sans split), Color tokens (velvet nocturne / celestial parchment), and Surface & shape language (arched cards, pill CTAs, StarField + semantic orbs). Do not restate or fork those values here.

---

## Typography (locked)

> **Sora speaks for the brand. Work Sans runs the product.**


| Font          | Role              | Where                                                     | Weights                                                                    |
| ------------- | ----------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Sora**      | Brand / marketing | Landing, pricing, marketing nav, CTAs, wordmark           | 700 wordmark · 600 headings · 500 subheads/buttons · 400 body              |
| **Work Sans** | Product UI        | Dashboard, plans, analytics, settings, forms, tables, IDs | 600 headings · 500 labels/controls · 400 body · `tabular-nums` for figures |


### Retired for this direction


| Font                                       | Former role                         | Status                                                                                                        |
| ------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Young Serif**                            | Marketing display (`.marketing-h`*) | **Retired.** Marketing uses responsive `font-serif` (Sora) utilities; `.marketing-h`* classes removed.        |
| **JetBrains Mono**                         | Default product mono in exploration | Do not use as a brand voice; keep only if needed for true code/IDs (optional, not part of the two-font story) |
| **Instrument Serif / other canvas trials** | Exploration only                    | Discarded                                                                                                     |


Do not add a third brand face. Product stays Work Sans; marketing brand voice is Sora only.

### Live hero & type patterns

- Hero display: responsive Sora via `font-serif` (roughly `text-[2.75rem]` → `md:text-[3.25rem]`).
- Default emphasis: italic `text-primary` on the second hero line — not full-line `gradient-text`.
- Section labels: uppercase Sora with wide tracking (`SectionOverline` / hero overline).
- Marketing CTAs: pill classes from `marketing-cta.ts` (not `Button variant="cta"` by default).
- Header: flat `SiteHeaderChrome` + `marketing-header-classes.ts` (editorial underline nav).

---

## Color tokens (live in `globals.css`)

Semantic Tailwind names stay (`background`, `foreground`, `primary`, `panel`, …). Values below are the After Hours mapping now applied in `:root` / `.dark`.

### Dark (velvet nocturne)


| Role               | Hex       | Notes                      |
| ------------------ | --------- | -------------------------- |
| Background         | `#180d18` | Page ground                |
| Ink / foreground   | `#f8ead7` | Warm parchment text        |
| Muted text         | `#c7aeb7` | Secondary copy             |
| Accent             | `#f0a06e` | Peach “star” / emphasis    |
| Card               | `#2b1728` | Raised surfaces            |
| Soft               | `#3b2135` | Soft fills / ambient       |
| Line / border      | `#7a4b62` | Dividers                   |
| Note / muted panel | `#351b30` | Nested notes               |
| CTA surface        | `#2b1728` | Default CTA plate          |
| CTA ink            | `#f8ead7` | Text on CTA plate          |
| CTA accent ink     | `#1b0e19` | Text on solid accent fills |


### Light (celestial parchment)


| Role               | Hex       | Notes                      |
| ------------------ | --------- | -------------------------- |
| Background         | `#f4ebe1` | Parchment blush            |
| Ink / foreground   | `#26102a` | Deep plum                  |
| Muted text         | `#6e5268` | Secondary copy             |
| Accent             | `#c96d42` | Copper / peach             |
| Card               | `#faf4ec` | Raised surfaces            |
| Soft               | `#e6d5c9` | Soft fills                 |
| Line / border      | `#c9a898` | Dividers                   |
| Note / muted panel | `#efe5db` | Nested notes               |
| CTA surface        | `#faf4ec` | Default CTA plate          |
| CTA ink            | `#26102a` | Text on CTA plate          |
| CTA accent ink     | `#f4ebe1` | Text on solid accent fills |


### Semantic mapping (live)


| Semantic token                | After Hours role                        |
| ----------------------------- | --------------------------------------- |
| `--background`                | bg                                      |
| `--foreground`                | ink                                     |
| `--muted-foreground`          | muted                                   |
| `--primary` / accent action   | accent (peach/copper)                   |
| `--primary-foreground`        | ctaAccentInk on solid accent            |
| `--card` / `--panel`          | card                                    |
| `--panel-muted` / soft washes | soft / noteBg                           |
| `--border` / `--input`        | line                                    |
| `--ring`                      | accent (focus)                          |
| `chart-1` … `chart-5`         | Peach/plum progression in `globals.css` |


State colors (`destructive`, `success`, `warning`) keep functional hues; retune only if contrast fails on new surfaces.

---

## Surface & shape language

- Arched / large-radius cards on marketing (`--radius-marketing` / `rounded-4xl`).
- Pill CTAs for marketing primary actions via `marketing-cta.ts`; product controls stay denser.
- Atmosphere via soft radial washes (`--app-background-image`) and celestial backdrops — Progress Jam dotted violet grid is gone.
- Marketing depth = semantic-token orbs + shared `StarField` + opaque panels — **not** liquid-glass.
- Light and dark are first-class; every token change must land in both `:root` and `.dark`.

---

## Live marketing composition

Migration phases 0–3 are **complete**. Unauthenticated `/` routes to `/landing`.


| Surface | Composition                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------- |
| Landing | `MarketingPageShell` + celestial backdrop; Hero → Drift → Route → Instruments → Questions → Polaris                 |
| Pricing | `MarketingPageShell` + `PricingShell` + Clerk `<PricingTable />` with After Hours appearance                        |
| Shared  | `MarketingPageShell`, `StarField`, `marketing-cta.ts`, `marketing-header-classes.ts`, route-local `SectionOverline` |


**Retired wrappers:** `MarketingHero`, `MarketingSection`, `MarketingCard`, liquid-glass stack, `HeaderLiquidGlassShell`, `marketing-glass-surface`.

**Visual anchors:**

- `src/app/(marketing)/landing/components/Landing.tsx`
- `src/app/(marketing)/pricing/page.tsx` + `PricingShell.tsx`
- `src/components/shared/nav/SiteHeaderChrome.tsx`
- `src/app/(app)/dashboard/page.tsx`
- `DESIGN.md` Layout section

**Out of scope until instructed:** Further canvas exploration (Mission Control / Field Notes).

---

## Tokenization (complete)

Tokens + fonts live in `globals.css` / `layout.tsx`. `DESIGN.md` YAML mirrors `globals.css` (never edit YAML first). Canvas remains a visual checklist only — not a second design system.

---

## Do / don’t

**Do**

- Use Sora only for brand/marketing voice.
- Use Work Sans for all product UI.
- Ship light and dark together for any token change.
- Prefer semantic classes over raw hex in components.
- Reuse `StarField` + semantic orbs for marketing backdrops.

**Don’t**

- Reintroduce Young Serif or a third brand font.
- Treat JetBrains Mono as brand typography.
- Mix Progress Jam violet with After Hours peach on the same ship.
- Reintroduce liquid-glass or cyan/cold decorative orb palettes.

---

## Related docs


| Doc                                  | Role                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `[DESIGN.md](../../DESIGN.md)`       | After Hours YAML + prose (mirrors `globals.css`)                           |
| `[style-guide.md](./style-guide.md)` | Live usage for After Hours product tokens + type                           |
| Implementation plan (archived)       | `.agents/recaps/07-18-2026/plans/after-hours-implementation-groundwork.md` |
