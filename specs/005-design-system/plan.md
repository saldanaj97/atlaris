<!-- 26b230ed-f1f8-45aa-92ad-31723ac0c246 1a3c919b-4116-429e-9210-5f3a91c98b75 -->

# Implementation Plan: Design System & Brand Identity

## Scope

Implements [#32](https://github.com/saldanaj97/atlaris/issues/32) with sub-issues [#54](https://github.com/saldanaj97/atlaris/issues/54), [#55](https://github.com/saldanaj97/atlaris/issues/55), and [#56](https://github.com/saldanaj97/atlaris/issues/56).

## Key Files to Update

- `src/app/globals.css`: define brand tokens via `@theme inline`, gradient tokens/utilities.
- `src/app/layout.tsx`: update `metadata` (title, description, OG/Twitter).
- `src/app/landing/page.tsx`, `src/app/dashboard/page.tsx`, `src/components/plans/*`, `src/app/settings/billing/page.tsx`, `src/app/pricing/page.tsx`: replace placeholder gradients/classes.
- `public/*`: favicon set (16x16, 32x32, 180x180), OG images (1200x630), hero assets.
- `docs/testing/testing.md`: note visual/WCAG checks.

## Steps

1. Define brand design tokens (Issue #32)

- Add tokens in `src/app/globals.css` under `@theme inline`:
- Colors: `--color-learning-primary`, `--color-learning-accent`, `--color-learning-secondary`, `--color-learning-success`, plus neutral ramp if needed.
- Gradients: `--gradient-surface`, `--gradient-hero`, `--gradient-card`.
- Shadows: `--shadow-glow`.
- Expose light/dark overrides under `.dark {}` ensuring WCAG AA contrast.
- Reference: Tailwind v4 theming with `@theme` and CSS vars ([Tailwind docs](https://github.com/tailwindlabs/tailwindcss.com/blob/main/src/docs/theme.mdx)).

2. Implement gradient utilities and semantic classes (Sub-issue #54)

- In `globals.css`, create utilities using Tailwind v4 `@utility`:
- `.bg-gradient-subtle { background-image: var(--gradient-surface) }`
- `.bg-gradient-hero { background-image: var(--gradient-hero) }`
- `.bg-gradient-card { background-image: var(--gradient-card) }`
- `.shadow-glow { box-shadow: var(--shadow-glow) }`
- Reduce intensity for dark mode variants if necessary.
- Replace usages across:
- `src/app/landing/page.tsx`
- `src/app/dashboard/page.tsx`
- `src/components/plans/*`
- `src/app/settings/billing/page.tsx`
- `src/app/pricing/page.tsx`
- Verify compile/build with utilities in place (Sub-issue [#54](https://github.com/saldanaj97/atlaris/issues/54)).

3. Update imagery, favicon/OG, and site metadata (Sub-issue #55)

- Add assets in `public/`:
- Favicon: `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`.
- OG: `og-default.jpg` (1200x630, <300kb), optionally `og-landing.jpg`.
- Hero: branded `hero-learning.jpg` replacement and any illustrations.
- Update `src/app/layout.tsx` `metadata`:
- `title`, `description` aligned to brand voice.
- `openGraph` images and `twitter` card (`summary_large_image`).
- Consider dynamic OG via `app/og/route.tsx` if needed (Next.js ImageResponse) ([Next.js docs](https://github.com/vercel/next.js/blob/canary/docs/01-app/01-getting-started/14-metadata-and-og-images.mdx)).
- Ensure `landing/page.tsx` uses branded hero image with optimized sizing and `next/image` blur placeholder (Sub-issue [#55](https://github.com/saldanaj97/atlaris/issues/55)).

4. Align pricing visuals and copy with tier gating/limits (Sub-issue #56)

- Use a single source of truth from `src/lib/stripe/usage.ts` TIER_LIMITS for feature bullets:
- Free: 3 plans, 5 regenerations, 10 exports
- Starter: 10 plans, 10 regenerations, 50 exports, priority queue
- Pro: unlimited plans/exports, 50 regenerations, analytics
- Refactor `src/app/pricing/page.tsx` to render from a local mapping that mirrors `TIER_LIMITS` to avoid drift; add a note referencing limits file.
- Keep Stripe price fetch as-is; wire Subscribe buttons.
- Add "Go to billing portal" link for existing subscribers using `getCustomerPortalUrl` (optional CTA, server action or route).
- Validate copy and highlight style of recommended tier (starter) as per product strategy (Sub-issue [#56](https://github.com/saldanaj97/atlaris/issues/56)).

5. Accessibility and contrast validation (Issue #32 & #54)

- Validate AA contrast in light/dark for text-on-background and text-on-gradients using Chrome DevTools and WebAIM.
- Adjust `oklch` chroma/lightness until all tokens pass AA; re-test.
- Document tokens and contrast notes in `docs/project-info/mvp-open-items.md` or a brief appendix in `docs/testing/testing.md`.

6. QA and testing hooks

- Smoke run: `pnpm build` to ensure new utilities compile.
- E2E spot checks: render landing, dashboard, plans, pricing, billing.
- Metadata: verify OG/Twitter tags in page head and with a preview tool.

## Deliverables

- Brand token definitions and utilities in `src/app/globals.css`.
- Updated pages/components replacing placeholder gradients.
- New assets in `public/` and updated `metadata` in `layout.tsx`.
- Pricing page copy in sync with `src/lib/stripe/usage.ts`.
- Brief doc updates for visual checks.

## Links

- Parent: [#32](https://github.com/saldanaj97/atlaris/issues/32)
- Sub-issues: [#54](https://github.com/saldanaj97/atlaris/issues/54), [#55](https://github.com/saldanaj97/atlaris/issues/55), [#56](https://github.com/saldanaj97/atlaris/issues/56)
- Tailwind v4 theming: https://github.com/tailwindlabs/tailwindcss.com/blob/main/src/docs/theme.mdx
- Next.js metadata & OG: https://github.com/vercel/next.js/blob/canary/docs/01-app/01-getting-started/14-metadata-and-og-images.mdx

### To-dos

- [ ] Define brand color and gradient tokens in globals.css
- [ ] Add gradient/shadow utilities and dark variants
- [ ] Replace placeholder gradient classes across pages/components
- [ ] Add favicon, OG images, and branded hero assets to public/
- [ ] Update layout.tsx metadata for brand, OG/Twitter
- [ ] Sync pricing page features/limits from usage.ts
- [ ] Validate and adjust tokens for WCAG AA
- [ ] Document visual checks and tokens in docs/testing/testing.md
