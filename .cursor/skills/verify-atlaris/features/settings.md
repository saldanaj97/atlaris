# Settings

Signed-in settings is a routed ledger: `/settings` redirects to `/settings/profile`. Left tabs navigate to `/settings/profile`, `/settings/billing`, `/settings/usage`, `/settings/ai`, `/settings/integrations`, and `/settings/notifications`.

## Sub-features

- `settings-load` opens `/settings` and lands on `/settings/profile` with heading `Make Atlaris yours.`
- `settings-sections` shows only the active section heading on each route.
- `settings-billing` shows billing status on `/settings/billing`.
- `settings-pricing` can be reached from `/pricing` (fixture grid in auth mode).

## How to get to it (user POV)

- Choose **Settings** in product navigation.
- Open `/settings` or `/settings/billing`.
- Open `/pricing` then return to settings after viewing plans.

## Driving it with verify-atlaris

Preconditions:

- Auth instance is healthy at `http://127.0.0.1:3101`.
- `control.ts doctor` reports `mode=auth`.

- **Open settings.** Navigate to `http://127.0.0.1:3101/settings`. URL becomes `/settings/profile`. Heading `Make Atlaris yours.` (level 1) is visible. Level-2 `Profile` is visible; other section headings are not.
- **Sections.** Visit each `/settings/{profile,billing,usage,ai,integrations,notifications}` route and confirm only that section heading. Async sections may take up to 15s.
- **Billing route.** Navigate to `http://127.0.0.1:3101/settings/billing`. Heading `Plan & billing` is visible; `Usage` is not. Text `Status` and `Next billing date` are visible. Status includes `active`.
- **Fixture pricing.** Navigate to `http://127.0.0.1:3101/pricing`. Heading is named `One sky. Three ways to cross it.` Copy `Local pricing preview — representative prices; checkout is disabled.` is visible. Plan actions are **Preview only** and disabled.
- **Proof.** Screenshot `/settings/billing` showing `Make Atlaris yours.` plus `Plan & billing`, and `/pricing` showing the local preview notice. Save under `artifacts/<run-id>/settings/`.

## Gotchas

- Auth pricing is the fixture grid, not live Clerk Billing. Disabled **Preview only** is success, not a broken checkout.
- Anon `/pricing` shows Clerk's table when Clerk UI is on; do not assert `Preview only` on `:3100`.
- Profile display name uses `aria-label="Name"` and stays visible. Save changes is disabled when clean. Do not submit profile edits unless that is the feature under test.
- `/analytics` redirects to `/analytics/usage`. That is a different feature; do not count it as settings proof.
