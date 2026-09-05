---
version: alpha
name: Atlaris
description: Agent entry point. The canonical detailed specification is docs/styles/design-system.md; shared foundations are adopted; page and component migration continues.
---

# Atlaris design entry point

## Overview

Read [the canonical design system](docs/styles/design-system.md) before introducing UI, changing shared components or tokens, modifying responsive behavior or visual states, or creating interface patterns. Consult it for marketing copy and brand usage too. This file is an orientation, not a second token catalog.

## Source of truth

| Question                               | Authority                                                                                                                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product behavior and business logic    | Current application code and tests, including real routes, permissions, billing and data contracts.                                                                                           |
| Intended visual and interaction design | [docs/styles/design-system.md](docs/styles/design-system.md), preserving its source contracts, proposals and open decisions.                                                                  |
| Actual runtime visual implementation   | [globals.css](src/app/globals.css), runtime tokens and shared components. Shared foundations follow the canonical specification; page and component migration remains scoped to their issues. |
| Agent/developer starting point         | This file; it defers detailed design rules to the canonical specification.                                                                                                                    |

Current CSS describes what runs; it does not override the intended design specification. Design mockups do not authorize new product functionality. [style-guide.md](docs/styles/style-guide.md) is a compatibility pointer; [after-hours-direction.md](docs/styles/after-hours-direction.md) is historical and has no current design authority.

## Brand direction

The intended direction uses restrained cool-black surfaces, clear light text, lavender emphasis and occasional astronomical imagery. Prioritize readable learning content and the next real action. Keep working surfaces opaque; use atmosphere where it supports the task. Follow the canonical chapters for values and state recipes rather than copying old theme values or sampling mockups.

## Before changing UI

- Reuse existing semantic roles, shared components and APIs. A proposed composition is not an existing export or prop.
- Preserve current routes, authentication, entitlements, billing, generation/recovery and data semantics. Analytics must follow the [existing metric contract](docs/architecture/usage-analytics-metric-contract.md).
- Preserve light/system preferences. Dark-first design does not authorize removing supported themes.
- Keep keyboard focus, labels, error relationships, truthful async states, responsive access and reduced-motion behavior intact; consult the relevant component/pattern and accessibility chapters.
- Keep unresolved decisions explicit: the complete vector logo lockup, exact named-font comparison, responsive sidebar and other proposed compositions still need implementation or review.
- Follow §27 for a bounded migration. Run token generation in the external reference package as described in the canonical document’s “External token generation” section; keep the package outside the repository and adopt only the generated assets needed by an approved implementation slice. Do not blindly replace global colors, spacing or component recipes.

## Validation

Follow the [repository verification policy](.cursor/rules/selective-verification.mdc) for the changed behavior. `pnpm design:lint` validates this entry point's tooling schema; it does not prove runtime adoption, visual parity or accessibility. Frontmatter deliberately carries metadata only so it cannot become a competing editable token source.
