# [Feature] Implement Freemium SaaS Model: Tier Caps, Regeneration, and Priority Support

## Description

Implement a robust freemium SaaS model with tier-based feature gating. Enforce free tier caps (e.g., plans up to 2 weeks duration), build plan regeneration and customization features (API routes, worker jobs, UI controls), and add priority topic support for paid tiers (queue prioritization, business logic, UI indicators).

## General Acceptance Criteria

- [ ] Free tier cap enforced: plans limited to 2 weeks (or configurable duration)
- [ ] Regeneration API route and worker job implemented
- [ ] UI controls for plan regeneration and customization (paid tiers only)
- [ ] Priority topic support: paid tiers get queue priority
- [ ] UI copy clearly communicates tier limitations and upgrade benefits
- [ ] Tier gates integrated with Stripe subscription status

## Sub-issues Acceptance Criteria

### Sub-issue 1: Free tier cap enforced [#39](https://github.com/saldanaj97/atlaris/issues/39)

- [ ] Free tier users cannot generate plans longer than 2 weeks (14 days)
- [ ] Cap is enforced before AI generation begins (validation layer)
- [ ] Configuration constant `FREE_TIER_MAX_WEEKS` or `FREE_TIER_MAX_HOURS` defined
- [ ] Clear error message returned when cap is exceeded
- [ ] UI shows upgrade prompt when free user requests longer plan
- [ ] Cap logic checks user's subscription tier from database
- [ ] Paid tiers (starter, pro) have no duration cap or higher caps

### Sub-issue 2: Regeneration/customization: API route + worker job + UI control [#51](https://github.com/saldanaj97/atlaris/issues/51)

- [ ] Create new API route: `POST /api/v1/plans/:planId/regenerate`
- [ ] Create new worker job: `src/workers/plan-regenerator.ts`
- [ ] Create new UI control: `src/components/plans/RegenerateButton.tsx`

### Sub-issue 3: Priority topic support: Business logic + queue priority + UI copy [#52](https://github.com/saldanaj97/atlaris/issues/52)

- [ ] Define priority topic list/flags and tier eligibility
- [ ] Queue priority increases for eligible users/topics
- [ ] UI labels/tooltip communicate priority benefit

## Test Outcomes (Plain English)

### Unit Tests

- Free tier cap logic correctly limits plan duration to 2 weeks
- Regeneration validation checks user tier before allowing regeneration
- Queue priority logic assigns higher priority to paid tier users
- Tier gate functions return correct access permissions based on subscription

### Integration Tests

- Free tier user generates plan, receives max 2-week plan
- Paid tier user generates longer plan, regenerates successfully
- Regeneration API triggers background worker job
- Priority queue processes paid tier jobs before free tier jobs
- Stripe webhook updates subscription status, tier gates reflect changes

### E2E Tests

- Free user generates plan, sees 2-week cap message, prompted to upgrade
- Paid user regenerates plan with customizations, new plan generated
- Priority support indicator shows in UI for paid users
- User upgrades subscription, immediately gains access to premium features

## Technical Notes

### Relevant Files/Locations

- `src/lib/db/usage.ts` - Tier cap enforcement logic
- `src/workers/plan-generator.ts` - Regeneration worker job
- Create new: `src/app/api/v1/plans/[id]/regenerate/route.ts` - Regeneration API
- `src/components/plans/` - UI controls for regeneration
- Create new: `src/lib/queue/priority.ts` - Priority queue logic
- `src/lib/db/schema.ts` - subscription_tier, subscription_status fields
- `src/app/api/webhooks/stripe/route.ts` - Stripe webhook handler

### Implementation Considerations

- **Free tier cap**: enforce in AI orchestrator pre-generation (prevent waste)
- **Cap logic**: `if (tier === 'free' && weeklyHours * weeksRequested > FREE_TIER_MAX_HOURS) throw error`
- **Regeneration**: create new plan_generation record, queue worker job
- **Worker job**: copy user inputs, apply customization changes, regenerate
- **Priority queue**: separate queues or priority field (paid = 10, free = 1)
- **UI copy**: "Upgrade to Pro for unlimited plan length" vs "Free: up to 2 weeks"
- **Stripe integration**: webhook updates user tier, cache subscription status
- Consider regeneration limits per tier (free = 0, starter = 3/month, pro = unlimited)

## Dependencies

- Note: Plan Structuring feature (not yet created as issue) will provide plan duration information needed to enforce caps
- Note: Dynamic Sync feature (#TBD) depends on tier gates from this issue

## References

### Context7 MCP Documentation

**Stripe Subscription Management:**

- Use Context7 MCP `/websites/stripe` for subscription tier management and webhooks
- Key webhook events for subscription lifecycle: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`
- Webhook signature verification required using endpoint secret and `Stripe.Webhook.constructEvent()`
- Subscription schedules API (`POST /v1/subscription_schedules`) enables managing subscription changes over time
- Store subscription status in database to avoid rate limits when checking access

### Web Search Findings

**Freemium Model Best Practices (2024-2025):**

- Usage-based limits are effective for free tiers (e.g., Loom's 5-minute video cap) - https://www.maxio.com/blog/freemium-model
- Balance critical: free features must demonstrate value without eliminating upgrade need - https://www.chargebee.com/blog/saas-freemium-model-advantages-and-disadvantages/
- Average SaaS freemium conversion rates: 8-10% (vs 1-2% for eCommerce) - https://userpilot.com/blog/freemium-conversion-rate/
- Clear value differentiation and upgrade messaging are essential for conversions - https://www.5wpr.com/new/how-freemium-models-drive-conversions-in-saas-tips-for-2025/
- Product-led growth now uses fine-grained feature gating and usage-based monetization - https://www.withorb.com/blog/saas-trends

**Feature Gating Implementation Patterns:**

- Avoid gating critical features; reserve premium features with clear value justification - https://www.withorb.com/blog/feature-gating
- RBAC (Role-Based Access Control) most common for SaaS with moderate complexity - https://www.enterpriseready.io/features/role-based-access-control/
- Code should couple to permissions/entitlements, not directly to subscription tiers - https://www.cerbos.dev/blog/implementing-an-authorization-model-for-a-saas-application
- Architecture warning: retrofitting fine-grained authorization is as hard as adding multi-tenancy; implement early - https://www.togai.com/blog/feature-gating-as-a-revenue-driver/
- Transparent messaging about tier limitations prevents customer alienation - https://salesmethodz.com/how-to-implement-feature-gating-in-your-saas-product/

**Priority Queue Design for Multi-Tenant Systems:**

- Sharded queues enable fair per-tenant processing via round-robin dequeuing - https://medium.com/thron-tech/multi-tenancy-and-fairness-in-the-context-of-microservices-sharded-queues-e32ee89723fc
- Throttling "greedy tenants" with usage thresholds (e.g., 100 jobs/day) improves fairness - https://evilmartians.com/chronicles/fair-multi-tenant-prioritization-of-sidekiq-jobs-and-our-gem-for-it
- Per-function queues with weighted random ordering based on latency, capacity, and tier - https://www.inngest.com/blog/building-the-inngest-queue-pt-i-fairness-multi-tenancy
- Facebook's FOQS: distributed priority queue on sharded MySQL handling trillions of items - https://blog.bytebytego.com/p/how-facebooks-distributed-priority
- PostgreSQL-based job queues can support multi-tenant priority systems - https://www.holistics.io/blog/how-we-built-a-multi-tenant-job-queue-system-with-postgresql-ruby/

### File Paths/References

- `docs/project-info/mvp-open-items.md` - Source requirements
- Usage tracking: `src/lib/db/usage.ts`
- Worker: `src/workers/plan-generator.ts`
- Stripe integration: existing subscription handling in `src/app/api/webhooks/stripe/route.ts`

---

**Sub-issues** for the three checkbox items will be created separately and linked to this parent issue.
