# After Hours — approved product direction

**Status:** **Live.** Semantic CSS vars, typography, marketing surfaces, navigation, and core product pages now follow After Hours.

**Decision date:** 2026-07-18
**Exploration reference:** Cursor canvas `theme-after-hours-site.canvas.tsx` (full-site mocks: Landing, Pricing, Dashboard, Plans, Analytics, Settings, Achievements)

---

## Brand story

**After Hours** = atlas + Polaris: custom maps and guides for learning. Velvet nocturne (dark) or celestial parchment (light). Warm peach/copper accent against plum ink — not Progress Jam violet.

---

## Typography (locked)

> **Sora speaks for the brand. Work Sans runs the product.**

| Font | Role | Where | Weights |
| --- | --- | --- | --- |
| **Sora** | Brand / marketing | Landing, pricing, marketing nav, CTAs, wordmark | 700 wordmark · 600 headings · 500 subheads/buttons · 400 body |
| **Work Sans** | Product UI | Dashboard, plans, analytics, settings, forms, tables, IDs | 600 headings · 500 labels/controls · 400 body · `tabular-nums` for figures |

### Retired for this direction

| Font | Former role | Status |
| --- | --- | --- |
| **Young Serif** | Marketing display (`.marketing-h*`) | Replace with Sora on marketing |
| **JetBrains Mono** | Default product mono in exploration | Do not use as a brand voice; keep only if needed for true code/IDs (optional, not part of the two-font story) |
| **Instrument Serif / other canvas trials** | Exploration only | Discarded |

Do not add a third brand face. Product stays Work Sans; marketing brand voice is Sora only.

---

## Color tokens (live in `globals.css`)

Semantic Tailwind names stay (`background`, `foreground`, `primary`, `panel`, …). Values below are the After Hours mapping now applied in `:root` / `.dark`.

### Dark (velvet nocturne)

| Role | Hex | Notes |
| --- | --- | --- |
| Background | `#180d18` | Page ground |
| Ink / foreground | `#f8ead7` | Warm parchment text |
| Muted text | `#c7aeb7` | Secondary copy |
| Accent | `#f0a06e` | Peach “star” / emphasis |
| Card | `#2b1728` | Raised surfaces |
| Soft | `#3b2135` | Soft fills / ambient |
| Line / border | `#7a4b62` | Dividers |
| Note / muted panel | `#351b30` | Nested notes |
| CTA surface | `#2b1728` | Default CTA plate |
| CTA ink | `#f8ead7` | Text on CTA plate |
| CTA accent ink | `#1b0e19` | Text on solid accent fills |

### Light (celestial parchment)

| Role | Hex | Notes |
| --- | --- | --- |
| Background | `#f4ebe1` | Parchment blush |
| Ink / foreground | `#26102a` | Deep plum |
| Muted text | `#6e5268` | Secondary copy |
| Accent | `#c96d42` | Copper / peach |
| Card | `#faf4ec` | Raised surfaces |
| Soft | `#e6d5c9` | Soft fills |
| Line / border | `#c9a898` | Dividers |
| Note / muted panel | `#efe5db` | Nested notes |
| CTA surface | `#faf4ec` | Default CTA plate |
| CTA ink | `#26102a` | Text on CTA plate |
| CTA accent ink | `#f4ebe1` | Text on solid accent fills |

### Suggested semantic mapping (implementation)

| Semantic token | After Hours role |
| --- | --- |
| `--background` | bg |
| `--foreground` | ink |
| `--muted-foreground` | muted |
| `--primary` / accent action | accent (peach/copper) |
| `--primary-foreground` | ctaAccentInk on solid accent |
| `--card` / `--panel` | card |
| `--panel-muted` / soft washes | soft / noteBg |
| `--border` / `--input` | line |
| `--ring` | accent (focus) |
| Chart series | Derive from accent + plum family — define in token pass |

State colors (`destructive`, `success`, `warning`) keep functional hues; retune only if contrast fails on new surfaces.

---

## Surface & shape language (direction)

- Arched / large-radius cards on marketing and expressive product moments.
- Pill CTAs acceptable for marketing primary actions; product controls stay denser (existing radius scale unless token pass revises `--radius`).
- Atmosphere via soft radial washes and parchment/plum grounds — not Progress Jam dotted violet grid once migrated.
- Light and dark are first-class; every token change must land in both `:root` and `.dark`.

---

## First ship scope (decided for planning)

**Slice:** Token foundation first, then **marketing-first brand signal**, then app shell, then dense product pages.

| Phase | Scope | Done when |
| --- | --- | --- |
| **0 — Tokens** | Map After Hours → CSS vars in `globals.css`; load Sora + Work Sans in `layout.tsx`; update `DESIGN.md` YAML + live style-guide sections | `pnpm design:lint` green; light/dark smoke on one shell page |
| **1 — Marketing** | Landing + pricing (+ marketing nav/wordmark) on Sora + After Hours surfaces | Brand test: first viewport still reads Atlaris with nav removed |
| **2 — App shell** | Site header, page shell, shared chrome on Work Sans + new tokens | Dashboard shell feels After Hours without full page redesigns |
| **3 — Dense product** | Dashboard, plans, analytics, settings, achievements | Page-by-page against canvas checklist |

**Out of scope until instructed:** Rewiring live `/pricing` to `PricingDesignExplorer`, deleting Progress Jam artifacts before tokens ship, expanding Mission Control / Field Notes canvases.

---

## Tokenization approach (plan only)

1. Keep semantic token **names**; swap **values** (and font family vars).
2. Add Sora via `next/font` → `--font-sora`; keep Work Sans → `--font-work-sans`.
3. Point `--font-family-display` (and marketing heading classes) at Sora; keep `--font-family-base` / `--font-family-heading` on Work Sans.
4. Retire Young Serif from `layout.tsx` once no marketing class depends on it.
5. Mirror stable public tokens into `DESIGN.md` YAML after `globals.css` changes (never the reverse).
6. Update `docs/styles/style-guide.md` live sections in the same PR as tokens go live.
7. Use the After Hours canvas as a visual checklist, not as a second design system.

---

## Do / don’t (post-migration)

**Do**

- Use Sora only for brand/marketing voice.
- Use Work Sans for all product UI.
- Ship light and dark together for any token change.
- Prefer semantic classes over raw hex in components.

**Don’t**

- Reintroduce Young Serif or a third brand font.
- Treat JetBrains Mono as brand typography.
- Mix Progress Jam violet with After Hours peach on the same ship.
- Implement page restyles before Phase 0 tokens land.

---

## Related docs

| Doc | Role after this decision |
| --- | --- |
| [`DESIGN.md`](../../DESIGN.md) | After Hours YAML + prose (mirrors `globals.css`) |
| [`style-guide.md`](./style-guide.md) | Live usage for After Hours product tokens + type |
| [Pricing redesigns README](../../src/app/(marketing)/pricing/redesigns/README.md) | Archive of three explorations; After Hours chosen |
| Implementation plan | `.agents/recaps/07-18-2026/plans/after-hours-implementation-groundwork.md` |
