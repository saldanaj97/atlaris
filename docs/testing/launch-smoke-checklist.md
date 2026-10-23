# Launch smoke checklist (production)

Run this list in **production** before each waitlist batch is invited and again on launch day before and after the `launch-waitlist` flag comes off (target Fri 2026-11-06). It is a manual or agent-run list, not a test suite. [DEV-178](https://linear.app/saldana-software/issue/DEV-178) covers visual checks on staging; this list covers the production flows end to end. Spec and run log: [DEV-187](https://linear.app/saldana-software/issue/DEV-187).

Every production action here (checkouts, account deletion, flag, env and Clerk changes) needs the owner's go-ahead for that run. Provider dashboard steps (Vercel, Clerk, Stripe, Supabase, PostHog, Sentry, OpenRouter) are done by the owner. A failing check gets its own Linear bug, linked from DEV-187. Times are America/Chicago.

## Open decisions before the first batch

1. **How invited batches get past the gate.** `launch-waitlist` is one global value: `resolveSiteGate()` in `src/lib/proxy/site-gate.ts` takes no user, and the proxy (`src/proxy.ts`) redirects every non-exempt path to `/waitlist` while it is on. Inviting someone from the Clerk waitlist lets them create a Clerk account, but Atlaris still sends them to `/waitlist`. Only requests with the `vercel-flag-overrides` cookie get through. No Linear issue covers per-user admission yet, so batches need a decision (or a code change) before 2026-10-30.
2. **How to pay for production checkouts.** See [Checkout in production](#checkout-in-production-decision).

## Before you start

| Need                                | Where                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production QA users                 | `qa-free@atlaris.app`, `qa-starter@atlaris.app`, `qa-pro@atlaris.app` on the Clerk production instance. Starter and Pro are on $0 complimentary prices, so their plans cost nothing to bill. `qa-free` has already used its one lifetime Free plan, so plan creation for it returns `403 FREE_PLAN_ALLOWANCE_USED`; the Free check uses a new throwaway user (check 3)                                                                                                       |
| Getting past the gate while it's on | Set the `launch-waitlist` override to **Launched** (`false`) in the Vercel Toolbar's Flags Explorer on `atlaris.app`. It sets the `vercel-flag-overrides` cookie, which also skips the 60 s gate cache. Agents build the same cookie with `encryptOverrides({ 'launch-waitlist': false }, FLAGS_SECRET)` from the `flags` package (`FLAGS_SECRET` from `vercel env pull --environment=production`); don't print it                                                           |
| Signing in as a QA user             | In a browser: `/auth/sign-in` with the override set. `scripts/dev/agent-session.ts` only targets `local` and `staging` ([agent-sessions.md](../development/agent-sessions.md)), so production agents sign in with a Clerk sign-in token: Backend API `POST /sign_in_tokens`, then the Frontend API at `https://clerk.atlaris.app/v1/client/sign_ins` with `strategy=ticket` and `Origin: https://atlaris.app` (cookie mode). Production rejects Backend API `POST /sessions` |
| Reading the production DB           | Supabase Dashboard → production project → SQL Editor (read-only queries below). Never point a local script at production                                                                                                                                                                                                                                                                                                                                                     |
| Sentry                              | Org `jcs-software`, projects `atlaris` (app) and `atlaris-jobs` (Worker)                                                                                                                                                                                                                                                                                                                                                                                                     |

## Run sheet

Copy this into a DEV-187 comment for each run and fill it in.

```text
Run: <batch N | launch day before flag-off | launch day after flag-off>   Date/time (CT):
Production deployment / commit:
OpenRouter balance before:            after:
Key usage before (free/starter/pro):  after:
Sentry: new issues since <start time> in atlaris / atlaris-jobs:
1 Waitlist form   2 Sign-up page   3 Free plan   4 Starter plan   5 Pro plan
6 Starter checkout   7 Pro checkout   8 Account deletion   9 Notification email
Failures (Linear bug links):
```

## 0. Baseline (before any other check)

1. Note the start time. Sentry issues created after it count against this run.
2. OpenRouter → Credits: note the balance.
3. Note each tier key's usage. `OPENROUTER_API_KEY_FREE`, `_STARTER` and `_PRO` are the per-tier keys (`src/lib/config/env/ai.ts`); each falls back to `OPENROUTER_API_KEY` when unset, so note that key too if a tier key is missing. `GET https://openrouter.ai/api/v1/key` returns `data.usage` (all time) and `data.usage_daily` (current UTC day) for the key that calls it:

   ```bash
   op run --environment <atlaris-vercel-prod Environment ID> -- sh -c 'curl -s https://openrouter.ai/api/v1/key -H "Authorization: Bearer $OPENROUTER_API_KEY_STARTER"'
   ```

   Repeat with `$OPENROUTER_API_KEY_FREE` and `$OPENROUTER_API_KEY_PRO`. The Environment name is from [secrets-sync.md](../development/secrets-sync.md); production values prompt the 1Password desktop app.

**Pass:** balance and three usage numbers recorded. Balance at or above the launch buffer.

## 1. Waitlist form accepts entries (flag on only)

User: none. Signed out, **no** override cookie.

1. Open `https://atlaris.app/dashboard`. It should redirect to `/waitlist`.
2. Enter an address you can read (not a QA user) in **Email address** and select **Join the waitlist**.

**Pass:** the redirect lands on `/waitlist`; the form shows "You’re on the waitlist. We’ll email your invite when Atlaris opens."; the address appears in Clerk Dashboard → Waitlist. Then select **Revoke** on that entry (or keep it as the throwaway for check 2).

## 2. Sign-up page with Clerk bot protection (DEV-181)

User: a new throwaway address you can read.

While the flag is on, Clerk's sign-up mode is **Waitlist**, so only an invited address can finish sign-up, and the app's `/auth/sign-up` redirects to `/waitlist` without the override.

1. In Clerk Dashboard → Waitlist, select **Invite** on the throwaway entry from check 1.
2. With the override set, open `https://atlaris.app/auth/sign-up` with DevTools open.
3. Sign up through the "Accept invitation" link in Clerk's "Waitlist invitation" email.

**Pass:** the Clerk sign-up form renders on `/auth/sign-up`; the console shows no Content Security Policy violation for `*.protect.clerk.com` (allowed in `script-src` and `frame-src` by `src/lib/proxy/security-headers.ts`); sign-up completes and a `users` row exists for the new Clerk user ID. If the invitation link opens Clerk's hosted Account Portal instead of `atlaris.app/auth/sign-up`, the app page's CSP is only proven by step 2's console check; the full in-app sign-up is proven on launch day ([Flag-off](#launch-day-flag-off), step 6).

## 3. Free plan end to end

User: the throwaway from check 2 (a new user still has its one Free plan). Override set.

1. Open `/plans/new`, fill in a topic and a span of 2 weeks or less (`TIER_LIMITS.free.maxWeeks`), and submit.
2. Wait for the plan page to show the plan.
3. Open the first module (`/plans/<id>/modules/<moduleId>`) and wait for lessons.

**Pass:** the plan reaches `generation_status = 'ready'`; the first two modules reach `lesson_generation_status = 'ready'` on their own (finalization starts them, see [plan-generation-architecture.md](../architecture/plan-generation-architecture.md#module-lesson-generation-separate-pipeline)); a module page shows lesson content. Free runs on the `openrouter/free` router only (`freePolicy` in `src/features/ai/model-operation-policy.ts`), and the free key's usage stays near $0.

```sql
-- Replace <auth_user_id> (Clerk user ID).
select p.id, p.generation_status, m.title, m.lesson_generation_status
from learning_plans p
join users u on u.id = p.user_id
join modules m on m.plan_id = p.id
where u.auth_user_id = '<auth_user_id>'
order by p.created_at desc, m.title;
```

## 4. Starter plan end to end (watch this one: DEV-180)

User: `qa-starter@atlaris.app`. Override set.

Starter allows 10 active plans (`TIER_LIMITS.starter.maxActivePlans`). If it is at the limit, delete an old smoke plan first; `DELETE` returns `409` while that plan's lessons are still generating, so retry after they finish.

1. `/plans/new`: topic, span of 8 weeks or less, submit.
2. Wait for the plan, then open the first module.

**Pass:** plan `ready`; first two modules' lessons `ready` with content on the module page; the plan page shows **no** free-backup notice ("…generated with a free backup model because your paid model was unavailable", `FreeRouterFallbackNotice`). Starter's default for outlines and lessons is `openai/gpt-6-luna` (`STARTER_DEFAULT_MODEL_ID`). DEV-180 lets OpenRouter fall back to `openrouter/free` for a Starter lesson; if the notice shows, record which module and treat it as a warning to investigate, not a pass. Starter key usage rises; the per-plan cost target is $1.25 ([grounded-eval.md](./grounded-eval.md#pass-bar-per-tier)). Free-router fallbacks also send a Sentry `model_free_router_fallback` message ([available-models.md](../ai/available-models.md)).

## 5. Pro plan end to end

User: `qa-pro@atlaris.app`. Override set.

Same steps as check 4 (Pro has no week limit).

**Pass:** plan `ready`; first two modules' lessons `ready` with content; no free-backup notice. Pro defaults: outline `openai/gpt-6.1-sol`, lessons `anthropic/claude-haiku-5.5` (`PRO_DEFAULT_MODEL_BY_OPERATION`). Pro key usage rises; per-plan target $2.50.

## Checkout in production (decision)

The issue says "Clerk test card", but test cards are a **development-instance** feature. Clerk's development instances use a shared Stripe test account; a production instance must connect its own Stripe account, and development Stripe accounts can't be used for production ([Clerk Billing overview](https://clerk.com/docs/guides/billing/overview)). Stripe also prohibits testing live mode with real payment details ([Stripe testing](https://docs.stripe.com/testing)), and Clerk Billing has no refund feature, so refunds go through the Stripe Dashboard. The Clerk docs don't mention coupons or promo codes. So in production, `4242 4242 4242 4242` will not complete a checkout.

Options for the owner to pick (record the choice on DEV-187):

| Option                                                                            | Cost and effort                                                                                                                                                                               | What it proves                                                      |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **A. Real card, then refund** (recommended once before batch 1 and on launch day) | Pays $25 (Starter) and the Pro upgrade on the owner's card; refund both in the Stripe Dashboard right after. Stripe keeps its processing fee on refunded charges; check Stripe's pricing page | Live checkout → Clerk webhook → Atlaris tier, with the real gateway |
| **B. Staging checkout every batch, A only on launch day**                         | Staging uses the Clerk development gateway and test cards ([manual real-checkout verification](../development/environment.md#manual-real-checkout-verification-opt-in-not-default-ci))        | Code path every batch; live gateway only once                       |
| **C. Ask Clerk support about a 100% discount for production**                     | Unknown; not in Clerk's docs                                                                                                                                                                  | Same as A without the charge, if it exists                          |

Batches between those runs can skip checks 6 and 7 when no billing code changed since the last pass.

## 6. Starter checkout on `/pricing`

User: the throwaway from checks 2 and 3 (currently Free). Override set. Card per the decision above.

1. Open `/pricing`, select **Begin with Starter**, tick "I agree to automatic … renewal and the Terms of Service", and complete Clerk checkout.
2. You land on `/settings/billing?checkout=1…`, which shows "Updating your subscription…" until the webhook projection catches up.

**Pass:** Settings → Billing says "You're currently on the Starter plan."; the DB agrees; Clerk Dashboard → Webhooks shows the `subscription.*` / `subscriptionItem.*` deliveries for this user answered `200`; `/plans/new` now accepts a span up to 8 weeks (`TIER_LIMITS.starter.maxWeeks`).

```sql
select subscription_tier, subscription_status, subscription_period_end, cancel_at_period_end
from users where auth_user_id = '<auth_user_id>';
```

Billing architecture and failure modes: [clerk-billing-architecture.md](../architecture/clerk-billing-architecture.md).

## 7. Pro checkout on `/pricing`

User: the same throwaway (now Starter). Override set.

1. `/pricing` → **Begin with Pro** → consent → checkout.

**Pass:** Settings → Billing says "You're currently on the Pro plan."; `subscription_tier = 'pro'` in the DB; webhook deliveries `200`.

## 8. Account deletion clears DB and PostHog (DEV-184)

User: the same throwaway (paid). Never delete a shared `qa-*` user.

1. Note the throwaway's Clerk user ID.
2. `/settings/profile` → **Delete account** → confirm **Delete account** in "Delete your account?" (Clerk asks to re-verify if the session is older than 10 minutes).
3. If option A was used, refund the charges in the Stripe Dashboard.

**Pass:**

- The browser lands on `/landing`, signed out. The user is gone from Clerk Dashboard → Users, and its subscription is ended (`deleteAccount` in `src/features/auth/account-deletion.ts` ends paid items before deleting the Clerk user).
- DB: the `users` row is a tombstone and every user-scoped table is empty for it (`USER_SCOPED_ERASE_TABLES` in `src/features/auth/clerk-user-projection.ts`):

  ```sql
  select id, email, name, clerk_deleted_at, posthog_deleted_at
  from users where auth_user_id = '<auth_user_id>';
  -- Expect: email null, name null, clerk_deleted_at and posthog_deleted_at set.

  select
    (select count(*) from learning_plans where user_id = u.id) as plans,
    (select count(*) from ai_usage_events where user_id = u.id) as ai_usage,
    (select count(*) from usage_metrics where user_id = u.id) as usage_metrics,
    (select count(*) from user_preferences where user_id = u.id) as preferences
  from users u where u.auth_user_id = '<auth_user_id>';
  -- Expect: all 0.
  ```

- PostHog → Persons: searching the Clerk user ID (PostHog's distinct ID, set by `PostHogUserIdentifier`) finds no person. If `posthog_deleted_at` is still null, the Worker's daily `0 3 * * *` cron retries it ([environment.md, PostHog](../development/environment.md#posthog)); recheck the next day.
- **Sentry is not deleted per user**, by design: Sentry has no per-user delete, and the privacy policy states its 30-day retention (DEV-184). The check is that Sentry never held the identity: Sentry → Issues/Discover search `user.id:<auth_user_id>` and the throwaway email in both projects returns nothing, and production has `SENTRY_SEND_DEFAULT_PII` and `NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII` unset or `false`.

## 9. One notification email arrives

User: `qa-starter@atlaris.app` (needs an inbox you can read for that address; confirm before relying on it). Spans a day: set up the afternoon before.

1. `/settings/notifications`: turn on **Daily reminder emails**, select **Save Preferences**.
2. Make sure the user has an incomplete plan and no activity after midnight in its time zone (`user_preferences.analytics_timezone`, default `UTC`, synced when the user opens `/analytics/usage`).
3. The daily run fires at `0 14 * * *` UTC: 09:00 CDT through 2026-10-31, 08:00 CST from 2026-11-01.

**Pass:** the daily reminder email arrives from `RESEND_FROM` with working links to `atlaris.app`. If not, walk the "Why didn't this user get email?" checklist in [email-notification-delivery-runbook.md](../architecture/email-notification-delivery-runbook.md); scheduled runs need the Worker secret `JOB_EMAIL_DELIVERY_ENABLED=true`. Don't use the manual run route for this check: it starts a run for every opted-in user.

## 10. Close the run

1. Repeat the OpenRouter balance and key-usage readings from check 0.
2. Sentry, both projects: filter issues by "first seen" after the start time.

**Pass:** no new Sentry issue groups from the run (an existing group that grew gets a note); usage deltas match the plans run (Free ≈ $0; Starter and Pro within their per-plan targets). Post the run sheet on DEV-187.

## Launch day: flag off

Do these on 2026-11-06 after a passing run. The owner does steps 1–4 in the provider dashboards. Background: [environment.md, Vercel Flags and Flag and gate ownership](../development/environment.md#flag-and-gate-ownership).

1. **Clerk** Dashboard (production instance) → **Access mode** → select **Open** → **Save**. The app is still gated, so no one reaches the app's sign-up yet.
2. **Vercel** → Atlaris project → Flags → `launch-waitlist` → set Production to **Launched** (`false`).
3. Wait at least 60 s (`SITE_GATE_CACHE_TTL_MS`). Check from a browser **without** the override cookie.
4. **Vercel** → Settings → Environment Variables → Production → remove `LAUNCH_WAITLIST`, then redeploy the current Production deployment so running instances drop it. Vercel env changes reach only new deployments. Keep the `launch-waitlist` flag itself defined in Vercel Flags: it has no `defaultValue`, so deleting it makes every evaluation throw.
5. Confirm the redirect is gone:

   ```bash
   curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://atlaris.app/dashboard
   ```

   **Pass:** the redirect URL no longer contains `/waitlist`. A signed-out `/dashboard` may still answer `307`, but to Clerk sign-in, not to `/waitlist`. `https://atlaris.app/auth/sign-up` answers `200`, and `/waitlist` redirects home.

6. Sign up through `https://atlaris.app/auth/sign-up` with a new throwaway address, DevTools open. **Pass:** bot protection loads without CSP errors, sign-up completes, and `/dashboard` loads signed in. Delete the throwaway as in check 8.
7. Run checks 3–5 and 10 once more without the override cookie.

**Rollback:** set `launch-waitlist` back to **Waitlist** in Vercel Flags (applies within 60 s), set Clerk Access mode back to **Waitlist**, and restore `LAUNCH_WAITLIST=true` in Production with a redeploy.
