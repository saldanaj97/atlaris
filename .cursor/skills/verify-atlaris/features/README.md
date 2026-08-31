# Atlaris verification map

This directory is the maintained source for verifying user-facing Atlaris behavior. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `./node_modules/.bin/tsx scripts/verify-atlaris/control.ts launch --mode=anon` or `--mode=auth`.
- Anon lives at `http://127.0.0.1:3100`. Auth lives at `http://127.0.0.1:3101`.
- Run `... control.ts doctor` and require the expected URL, mode, and (for anon) `/dashboard` → 307.
- Never drive `:3000` or any instance this run did not start.
- One mode at a time. Cleanup before switching anon ↔ auth.
- Auth uses the seeded local product-testing user, mock AI, and fixture pricing (checkout disabled).
- Put proof under `.cursor/skills/verify-atlaris/artifacts/<run-id>/<feature-id>/`. Cleanup must not delete it.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer ARIA roles and accessible names over CSS selectors or DOM position.
- Drive the browser with Cursor browser tools against the doctor URL.
- Treat every name below as literal.
- Restore mutated user data only when the feature file says to. Keep proof artifacts.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot and a screenshot with Atlaris identity visible.
- Redirect proof includes status and `Location`.
- Mutation proof includes a second user-facing read (list or detail).
- Record the feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify-atlaris` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Marketing landing](./marketing-landing.md) covers the signed-out home, hero CTAs, and pricing hop.
- [Auth gate](./auth-gate.md) covers anonymous redirects into sign-in and the sign-in page itself.
- [Dashboard](./dashboard.md) covers the signed-in home, empty vs resume states, and nav to plans.
- [Create a plan](./create-plan.md) covers the new-plan form, generation, and opening a module.
- [Settings](./settings.md) covers the settings ledger and billing/usage headings.
