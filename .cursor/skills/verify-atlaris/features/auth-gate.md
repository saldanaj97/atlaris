# Auth gate

Anonymous visitors cannot open product routes. Each protected URL redirects to Clerk sign-in; the sign-in page itself loads.

## Sub-features

- `gate-redirect` sends each protected route to `/auth/sign-in`.
- `gate-signin-page` renders the sign-in screen.
- `gate-signup-page` renders the sign-up screen from `/auth/sign-up`.

## How to get to it (user POV)

- Open `/dashboard`, `/plans`, `/plans/new`, `/settings`, `/analytics`, `/analytics/usage`, or `/analytics/achievements` while signed out.
- Open `/auth/sign-in` or `/auth/sign-up` directly.
- Follow **Begin tonight** from landing while signed out.

## Driving it with verify-atlaris

Preconditions:

- Anon instance is healthy at `http://127.0.0.1:3100`.
- `control.ts doctor` reports `mode=anon` and `/dashboard` → 307.

- **Redirect headers.** `GET` `http://127.0.0.1:3100/dashboard` with redirects off. Status is `307` and `Location` contains `/auth/sign-in`. Repeat for `/plans`, `/plans/new`, `/settings`, `/analytics`.
- **Follow redirect.** Navigate to `http://127.0.0.1:3100/dashboard`. The URL contains `/auth/sign-in`.
- **Sign-in page.** Navigate to `http://127.0.0.1:3100/auth/sign-in`. Document title contains `Sign In`. A Clerk sign-in form is visible.
- **Sign-up page.** Navigate to `http://127.0.0.1:3100/auth/sign-up`. The URL is `/auth/sign-up` and a Clerk sign-up form is visible.
- **Proof.** Save redirect headers (`dashboard.headers.txt`) plus a screenshot of `/auth/sign-in` under `artifacts/<run-id>/auth-gate/`.

## Gotchas

- Doctor already checks `/dashboard` → 307. Still prove at least one other protected route; do not mark the whole list verified from doctor alone.
- Auth mode skips this feature. The product-testing user never sees these redirects.
- Clerk widgets load from `*.clerk.accounts.dev`. A blank sign-in page is often CSP or network, not a routing bug.
- Do not complete a real Clerk password flow in this skill unless a `+clerk_test` user is explicitly in scope. Redirect + form render is the proof.
