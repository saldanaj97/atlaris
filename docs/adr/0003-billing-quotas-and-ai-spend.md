# ADR 0003: Billing projection, quotas and AI spend ceilings

- Status: Accepted
- Date: 2026-11-20
- Source: moved here from inline code comments when comments were banned in `src/` (see the `delete-comment` skill). Each entry is the original comment text, grouped by the file it sat in.

## Context

Atlaris is paid-only. Clerk Billing is the source of truth, a local projection drives entitlements, and AI spend is capped per plan, per user per month and per tier per day. The reasoning below was kept in code comments across `src/features/billing`, `src/features/auth` and the pricing and settings surfaces.

## Decisions

### `src/app/(app)/settings/ai/components/GroundedModelPicker.tsx`

- `function GroundedModelPicker` — One grounded role pick. "Default" saves `null`, so the role follows the code-owned models.

### `src/app/(app)/settings/ai/components/ModelSelectionCard.tsx`

- `async function loadGroundedModelNames` — Display names for every grounded pick option and default, from Pro's synced models in one read; an id the guardrail doesn't list, or every id when the catalog can't be read, shows as itself.
- `function GroundedModelPicks` — Pro picks for grounded generation; shown only when `canShowGroundedPicks`.

### `src/app/(app)/settings/ai/components/model-selector.tsx`

- `proOnlyModels?: AvailableModel[];` — Models shown disabled with a Pro plan badge; never selectable.
- (file or block level) — Secondary matches the popover and card matches the trigger, so swap only in the list.
- (file or block level) — The open list can cover the hint below the trigger, so repeat it here.

### `src/app/(app)/settings/billing/components/BillingUnavailable.tsx`

- `function BillingUnavailable` — Shown when the billing snapshot can't be read; retry re-runs the server read.

### `src/app/(app)/settings/billing/components/ScheduledPlanChangeNotice.tsx`

- `function ScheduledPlanChangeNotice` — Names a plan switch Clerk has scheduled for period end. Atlaris stores only the plan a user has now, so this reads Clerk directly; it is display only and never affects entitlements. Render it only where Clerk UI is enabled.

### `src/app/(app)/settings/profile/actions.ts`

- `if` — A DEV_AUTH_USER_ID override must never delete the real session user.

### `src/app/(app)/settings/profile/components/DeleteAccountSection.tsx`

- `window.location.replace` — Leave the app with a full load instead of signOut(). Clerk's signOut refreshes this route first, and the session token stays valid for up to a minute, so the refresh renders a deleted user and throws. The user is already deleted in Clerk, so the next load is signed out.

### `src/app/(landing)/pricing/components/ClerkPlanAction.tsx`

- `viewerPending: boolean;` — Auth or the viewer's subscription hasn't loaded, so no action is safe yet.
- `redirectUrl` — Scheduling or keeping a plan changes no entitlement today, so there is no webhook for Settings to wait on.

### `src/app/(landing)/pricing/components/ClerkPricingTable.tsx`

- `appClosed?: boolean;` — Maintenance or launch waitlist: plans stay visible but every CTA goes through the proxy instead of Clerk modals.
- `function publicPlanFeatures` — Card copy comes from our tier limits, not from the Clerk plan description and features, so it always matches the comparison table and checkout.
- `const nextPlans` — Atlaris is paid-only: the Clerk default plan stays as the "no subscription" state but is never offered as a card.
- `if` — A signed-out click meant a new subscription. Moving to a lower plan is a scheduled switch, so it starts from that plan's own card.

### `src/app/(landing)/pricing/components/PricingShell.tsx`

- (file or block level) — Keeps the second sentence together instead of stranding "Pay".

### `src/app/(landing)/pricing/components/RenewalDisclosure.tsx`

- `function RenewalConsentHint` — Shown under a paid plan's subscribe button while the renewal box is unticked, so the disabled button says why it is disabled.

### `src/app/(landing)/pricing/components/checkout-resume.ts`

- `const CHECKOUT_CONSENT_PARAM` — Set when the visitor ticked the renewal checkbox before signing in, so the resumed checkout stays enabled.

### `src/app/(landing)/pricing/components/plan-action-state.ts`

- `if` — Clerk defers a move to a lower paid plan to the end of the period. A change of billing period may not defer, so it isn't offered as one.

### `src/app/(landing)/pricing/components/pricing-card-model.ts`

- `function isBelowPlan` — False when either plan has no rank, so an unknown plan never reads as lower or higher.

### `src/app/(landing)/pricing/page.tsx`

- `const siteGate` — The proxy keeps /pricing live while a site gate is on; skip the account DB read.
- `const signedIn` — Signed-in users pass the launch waitlist, so they get the live checkout.

### `src/app/(landing)/pricing/pricing-plan-features.ts`

- `function formatPlanLength` — Plan length is chosen in weeks, so pricing states it in weeks too.
- `...` — A tier with no regenerations omits the line rather than advertising a zero.
- `const PRICING_PLAN_FEATURES: Record` — Pricing card bullets derived from live tier limits. The cards always use these; Clerk Billing plan features are ignored so the cards cannot drift from the comparison table.
- `const PRICING_PLAN_DESCRIPTIONS: Record` — One-line card descriptions; like the bullets, these never come from Clerk.

### `src/features/auth/account-deletion.ts`

- `async function deleteAccount` — Deletes the signed-in account. Paid Clerk Billing items end first, because deleting the Clerk user alone leaves the subscription renewing. The Clerk user is deleted only after a re-fetch shows no paid item left, then the local row is tombstoned and its data erased, and the PostHog person is deleted. The user.deleted webhook repeats the last two steps if this process stops after the Clerk delete.

### `src/features/auth/posthog-person-deletion.ts`

- `async function deletePostHogPersonForDeletedUser` — Deletes a just-deleted user's PostHog person and marks the row when PostHog accepts it. Never throws: the account is already gone, and the jobs Worker retries unmarked rows daily (`retryPostHogPersonDeletions`).
- `async function retryPostHogPersonDeletions` — Deletes the PostHog persons of tombstoned users whose deletion PostHog has not accepted yet, up to one bulk request per run. Throws when PostHog rejects the request so the caller reports it.

### `src/features/billing/ai-spend-guard.ts`

- `function reportTierSpend` — One Sentry issue per tier, alert share and UTC day, so a "new issue" alert fires once a day for each.
- `async function assertAiSpendAllowed` — Admission check before any route starts paid AI work (DEV-208). Refuses with `503 AI_GENERATION_PAUSED` once the actor's tier has spent its daily ceiling today, then with `429 AI_BUDGET_EXHAUSTED` once this user's spend this month reaches their tier ceiling. Fails closed when spend cannot be read. A free trial draws on its own daily pool and a smaller monthly cap (`TRIAL_AI_BUDGET`); paid Starter spend counts toward neither. The `free` tier (no subscription) has no budget to check; the paid-only entitlement gate is what keeps it off paid AI.
- `logger.error` — Fail closed, like the hourly limiter: unverified spend is not admitted.

### `src/features/billing/clerk-billing/projection.ts`

- `function lowerPastDueItemAfterPlanEnded` — After a scheduled switch to a lower plan, a failed first charge leaves the lower plan past due and the stored tier on a plan Clerk no longer has live (Clerk may omit ended items). Access follows the lower plan. A past-due item above the stored tier never promotes.
- `if` — Failed attempts can include active-looking items; never use them to promote a tier.
- `subscriptionTier:` — An unpaid upcoming plan above the stored tier never promotes.

### `src/features/billing/clerk-billing/reconciliation.ts`

- `if` — A deleted Clerk payer can never refresh; acknowledge instead of retrying.
- `const preferWebhook` — An active paid item always wins over a snapshot that has no paid item at all: Clerk's re-fetch can lag or omit the item, so a free-only snapshot must not erase a paid upgrade just because its timestamp is equal or newer. A snapshot that does list a paid item (canceled, ended, past due, ...) still decides, so explicit downgrades keep working.
- `async function applyClerkBillingSource` — Applies a prepared billing projection. Production webhook and reconciliation callers must hold the payer xact lock first.
- `const isPaidUpgradeOverStaleFree` — A free-only event can store an equal or newer timestamp than the paid item event that follows it. An active paid item still upgrades a user who is sitting on Free that was never canceled (active or no status yet). Users in any other state (canceled, paid) keep the strict staleness check, so late events never undo a downgrade.

### `src/features/billing/clerk-billing/subscription-snapshot.ts`

- `const item` — A plan replaced by an upgrade can still list as canceled in its period, so a live item wins.

### `src/features/billing/errors.ts`

- `class UserNotFoundError extends AppError` — Error thrown when a user cannot be found in the database. This is typically an internal error as authenticated users should exist.
- `class UsageMetricsLockError extends AppError` — Error thrown when usage metrics cannot be locked for atomic operations. This indicates a database concurrency issue or transaction failure.
- `class UsageMetricsLoadError extends AppError` — Error thrown when usage metrics cannot be loaded from the database.

### `src/features/billing/plan-ai-budget.ts`

- `type AiBudgetTier` — Tiers that carry an AI budget. `free` is the "no subscription" state: the hosted app is paid-only, so it has no budget and no daily pool, and these ceilings are not read for it.
- `const PLAN_AI_BUDGET` — AI spend ceiling per fully generated plan (JCS-170). Interim: AI spend at 20% of revenue, Starter $25/month over 4 plan-equivalents and Pro $100/month over 8. The JCS-163 eval scores cost against the same ceilings.
- `const USER_AI_BUDGET_USD_BY_TIER` — AI spend ceiling per user per calendar month (UTC), across all of the user's plans, including deleted ones (DEV-208). New AI work is refused once a user reaches it; a run already admitted is still bounded by the per-plan ceiling. Values approved 2026-11-05.
- `const TIER_AI_DAILY_BUDGET:` — Second layer behind the per-user ceiling (DEV-208): each tier's total AI spend per UTC day, so a surge on one tier cannot pause the other. New AI work pauses for that tier at its ceiling, and Sentry gets a new issue each day a tier's spend first passes each alert share. Keep each ceiling under that tier's OpenRouter key limit, so the app stops cleanly before the provider starts failing calls.
- `const TRIAL_AI_BUDGET` — AI budget for a card-required free trial. A trial is a Starter plan with tighter caps, kept apart from paid Starter so abusing trials cannot pause paying users: - per plan: the Starter ceiling (`PLAN_AI_BUDGET`); a unit test keeps the two equal; - per user per calendar month (UTC): `userMonthlyUsd`; - all trial users together per UTC day: `dailyPoolUsd`, the real control on trial abuse (Clerk dedupes trials by verified email, not by card). Trials route through the Starter OpenRouter key, so that key's daily limit is shared with paid Starter spend. Keep the Starter pool plus this pool under it, or give trials a key of their own.

### `src/features/billing/regeneration-quota-boundary.ts`

- `import type` — Regeneration quota settlement at provider start. HTTP enqueue peeks current usage without settling. This boundary increments the regeneration meter when the provider is about to run so pre-provider failures do not consume and post-provider failures stay consumed. A grounded regeneration on a tier with a per-plan cap (Free: one per plan, JCS-162) counts this plan's regeneration jobs that reached provider start instead of the monthly meter.
- `async function reserveRegenerationQuotaAtProviderStart` — Settles regeneration usage at the provider boundary. The job row is locked before the usage row is touched. The durable marker and counter increment commit in the same transaction, so a marker parse or persistence failure rolls the counter back before the provider can run. A marker already present on the active job is the replay/idempotency guard; retries clear it before a new attempt is allowed to settle. `groundedTier` is set for a grounded regeneration; when its policy caps runs per plan, the plan row is locked and the other marked jobs counted.

### `src/features/billing/usage-metrics.ts`

- `async function getUsageSummaryForTier` — Get usage summary for a user whose tier has already been resolved. Caller contract: `tier` MUST come from the same `users` row as this request (e.g. read alongside the billing projection in `getBillingAccountSnapshot`). Passing a stale or unrelated tier will silently yield the wrong limits.

## Consequences

The code no longer carries this rationale inline. A change that would alter one of the behaviors above should update this ADR in the same pull request, and a new non-obvious decision belongs in an ADR, not in a comment.
