---
version: alpha
name: Atlaris
description: Agent entry point. The canonical detailed specification is docs/styles/design-system.md. Shared foundations and JCS-65 implementation slices are adopted; JCS-65 and JCS-97 were closed on 2026-10-14 without a separate integrated visual-acceptance pass.
---

# Atlaris design entry point

## Overview

Read [the canonical design system](docs/styles/design-system.md) before introducing UI, changing shared components or tokens, modifying responsive behavior or visual states, or creating interface patterns. Consult it for marketing copy and brand usage too. This file is an orientation, not a second token catalog.

## Find the right chapter

The canonical document is long. Read only the chapters your change touches: run `grep -n '^## ' docs/styles/design-system.md` for chapter line numbers, then read that range.

| Change                                         | Chapters                                        |
| ---------------------------------------------- | ----------------------------------------------- |
| Colors, type, spacing, radius, motion, tokens  | 03–07, 10–13                                    |
| Buttons, links, icon buttons                   | 14 Actions                                      |
| Inputs, selects, validation, form layout       | 15 Forms (component), 22 Forms (pattern)        |
| App shell, sidebar, tabs, breadcrumbs          | 16 Navigation, 20 Page layouts                  |
| Cards, badges, tables, progress, charts        | 17 Data display, 21 Cards & content groups      |
| Toasts, alerts, skeletons, spinners            | 18 Feedback, 23 Loading / empty / error         |
| Dialogs, sheets, menus, tooltips               | 19 Overlays                                     |
| Breakpoints and reflow                         | 06 Layout & breakpoints, 24 Responsive behavior |
| Focus, keyboard, reduced motion, screen reader | 25 Accessibility                                |
| Labels, messages, marketing and brand copy     | 26 Content & copy, 02 Logo & brand marks        |
| Mapping a design rule to existing code         | 27 Implementation mapping                       |

Skip "Final-stage sources" and "Inherited reference scopes" at the end unless you are auditing provenance.

## Source of truth

| Question                               | Authority                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product behavior and business logic    | Current application code and tests, including real routes, permissions, billing and data contracts.                                                                                                                                                                                                                                 |
| Intended visual and interaction design | [docs/styles/design-system.md](docs/styles/design-system.md), preserving its source contracts, proposals and open decisions.                                                                                                                                                                                                        |
| Actual runtime visual implementation   | [atlaris-tokens.css](src/styles/atlaris-tokens.css) (dark), [globals.css](src/app/globals.css) (light and bridge), and shared components. Shared foundations follow the canonical specification. JCS-65 implementation children are complete; JCS-97 was closed on 2026-10-14 without a separate integrated visual-acceptance pass. |
| Agent/developer starting point         | This file; it defers detailed design rules to the canonical specification.                                                                                                                                                                                                                                                          |

Current CSS describes what runs; it does not override the intended design specification. Design mockups do not authorize new product functionality.

## Brand direction

The intended direction is the **Midnight** palette (adopted 2026-10-30): restrained midnight-black surfaces, clear light text, cantaloupe for actions and brand emphasis, electric blue for links, focus and data lines, and occasional astronomical imagery. Blue is never a button fill and never sits beside a cantaloupe fill. Values and contrast pairs are in chapter 03. Prioritize readable learning content and the next real action. Keep working surfaces opaque; use atmosphere where it supports the task. Follow the canonical chapters for values and state recipes rather than copying old theme values or sampling mockups.

## Before changing UI

- Reuse existing semantic roles, shared components and APIs. A proposed composition is not an existing export or prop.
- Preserve current routes, authentication, entitlements, billing, generation/recovery and data semantics. Analytics must follow the [existing metric contract](docs/architecture/usage-analytics-metric-contract.md).
- Preserve light/system preferences. Dark-first design does not authorize removing supported themes.
- Keep keyboard focus, labels, error relationships, truthful async states, responsive access and reduced-motion behavior intact; consult the relevant component/pattern and accessibility chapters.
- Keep unresolved decisions explicit: the complete vector logo lockup, exact named-font comparison, responsive sidebar and other proposed compositions still need implementation or review.
- Follow §27 for a bounded migration. Dark tokens are edited directly in `src/styles/atlaris-tokens.css` and light tokens in `:root` in `src/app/globals.css`; there is no generation step (see “Token source” in the canonical document). Re-run the chapter 03 contrast pairs for any color change. Do not blindly replace global colors, spacing or component recipes.

## Validation

Follow the [repository verification policy](.cursor/rules/selective-verification.mdc) for the changed behavior. `pnpm exec designmd lint DESIGN.md` validates this entry point's tooling schema; it does not prove runtime adoption, visual parity or accessibility. Frontmatter deliberately carries metadata only so it cannot become a competing editable token source.
