# Settings

Signed-in settings is one ledger page: profile, billing, usage, AI model, integrations, and notifications.

## Sub-features

- `settings-load` opens `/settings` with heading `Settings`.
- `settings-sections` shows h2s `Profile`, `Plan & billing`, `Usage`, `AI model`, `Integrations`, `Notifications`.
- `settings-billing` shows billing status on `/settings#billing`.
- `settings-pricing` can be reached from `/pricing` (fixture grid in auth mode).

## How to get to it (user POV)

- Choose **Settings** in product navigation.
- Open `/settings` or `/settings#billing`.
- Open `/pricing` then return to settings after viewing plans.

## Driving it with verify-atlaris

Preconditions:

- Auth instance is healthy at `http://127.0.0.1:3101`.
- `control.ts doctor` reports `mode=auth`.

- **Open settings.** Navigate to `http://127.0.0.1:3101/settings`. Heading `Settings` (level 1) is visible.
- **Ledger.** Confirm level-2 headings: `Profile`, `Plan & billing`, `Usage`, `AI model`, `Integrations`, `Notifications`. Async sections may take up to 15s.
- **Billing hash.** Navigate to `http://127.0.0.1:3101/settings#billing`. Headings `Plan & billing` and `Usage` stay visible. Text `Status` and `Next billing date` are visible. Status includes `active`.
- **Fixture pricing.** Navigate to `http://127.0.0.1:3101/pricing`. Heading is named `One sky. Three ways to cross it.` Copy `Local pricing preview — representative prices; checkout is disabled.` is visible. Plan actions are **Preview only** and disabled.
- **Proof.** Screenshot `/settings#billing` showing `Settings` plus `Plan & billing`, and `/pricing` showing the local preview notice. Save under `artifacts/<run-id>/settings/`.

## Gotchas

- Auth pricing is the fixture grid, not live Clerk Billing. Disabled **Preview only** is success, not a broken checkout.
- Anon `/pricing` shows Clerk's table when Clerk UI is on; do not assert `Preview only` on `:3100`.
- Profile name fields use `aria-label="Name"` / `Edit name`. Do not submit profile edits unless that is the feature under test.
- `/analytics` redirects to `/analytics/usage`. That is a different feature; do not count it as settings proof.
