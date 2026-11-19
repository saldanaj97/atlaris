# Marketing landing

The signed-out landing page is the public home. It names the product promise and offers two routes: start a plan, or see pricing.

## Sub-features

- `landing-home` shows the hero on `/` and `/landing`.
- `landing-begin` follows **Create a plan** toward plan creation (auth gate if signed out).
- `landing-pricing` follows **See pricing** to the pricing page.
- `landing-header` follows the header **Create a plan** control.

## How to get to it (user POV)

- Open `http://127.0.0.1:3100/` (redirects to `/landing`).
- Open `http://127.0.0.1:3100/landing`.
- Choose **See pricing** in the hero, or **Pricing** in the header.
- Choose **Create a plan** in the hero or header.

## Driving it with verify-atlaris

Preconditions:

- Anon instance is healthy at `http://127.0.0.1:3100`.
- `control.ts doctor` reports `mode=anon`.

- **Open home.** Navigate to `http://127.0.0.1:3100/`. The URL becomes `/landing`. The heading reads `Name a goal. Get a plan for the hours you have.` The logo control is named `Atlaris - Go to homepage`.
- **Hero start.** Choose **Create a plan**. The browser leaves `/landing` for `/plans/new`, which the auth gate then sends to `/auth/sign-in`.
- **Hero pricing.** From `/landing`, choose **See pricing**. The URL is `/pricing`. The heading is named `Free for one plan. Pay when you need more`.
- **Header start.** From `/landing`, choose the header **Create a plan** link. Same sign-in result as the hero CTA.
- **Proof.** Snapshot and screenshot `/landing` showing the hero heading and both CTAs. Save under `artifacts/<run-id>/marketing-landing/`.

## Gotchas

- `/` is not a distinct page. Assert `/landing` after the redirect.
- Auth mode (`:3101`) sends `/` to `/dashboard`. This feature is anon-only.
- Header **Create a plan** is a link, not the hero button; both names are `Create a plan`.
- Pricing heading is `Free for one plan. Pay when you need more`, not the stale smoke string `invest in your growth`.
