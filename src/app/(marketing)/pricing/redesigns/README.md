# Pricing redesign archive (Jul 2026)

Five visual pricing directions explored as a tabbed design studio. Kept here for reuse when we redo the marketing landing page — not wired into the live `/pricing` route.

## Files

| File | Contents |
|------|----------|
| `PricingDesignExplorer.tsx` | Client studio shell + copy for all five directions |
| `PricingDesignExplorer.module.css` | Shared layout + theme blocks for each direction |

## Directions

| Id | Label | Feel |
|----|-------|------|
| `monograph` | Monograph | Editorial cream / Young Serif / red accent |
| `mission` | Mission Control | Dark teal console / monospace / neon green |
| `field` | Field Notes | Sage field guide / organic / terracotta |
| `bauhaus` | Bauhaus | Primary poster / heavy borders / hard shadow |
| `nocturne` | After Hours | Dark plum / display serif / peach accent |

## Re-wire later

Live page today is the previous production layout in `../page.tsx`.

To preview these again:

1. Import `PricingDesignExplorer` from this folder in `../page.tsx`.
2. Wrap the Clerk `PricingTable` (or `LocalClerkBillingNotice`) as `children`.
3. Pass Clerk `appearance.variables` that read `--pricing-*` CSS vars (see git history on `page.tsx` around the design-studio commit, or the explorer CSS for var names).
4. Prefer `MarketingPageShell` with `className='overflow-visible bg-none'` so theme backgrounds show through.
