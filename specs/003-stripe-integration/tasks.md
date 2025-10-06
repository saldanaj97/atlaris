# Stripe Integration Implementation Plan

## 1. Environment Variables (.env)

Add the following to your `.env` file:

```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_...          # Get from Stripe Dashboard → Developers → API keys
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...  # Get from same location

# Stripe Webhook
STRIPE_WEBHOOK_SECRET=whsec_...        # Get after creating webhook endpoint in Dashboard

# Stripe Product/Price IDs (create these in Dashboard first)
STRIPE_STARTER_MONTHLY_PRICE_ID=price_...
STRIPE_STARTER_YEARLY_PRICE_ID=price_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_YEARLY_PRICE_ID=price_...
```

---

## 2. Stripe Dashboard Setup

### A. Create Products and Prices

1. **Navigate to**: Stripe Dashboard → Products → Add product

2. **Create Product: "Starter"**
   - Name: `Starter Plan`
   - Description: `10 active plans, 10 regenerations/month, priority queue`
   - Create two prices:
     - **Monthly**: $10 USD, recurring monthly
     - **Yearly**: $100 USD, recurring yearly (save $20/year)
   - Add metadata: `tier: starter`

3. **Create Product: "Pro"**
   - Name: `Pro Plan`
   - Description: `Unlimited plans, 50 regenerations/month, highest priority, analytics`
   - Create two prices:
     - **Monthly**: $20 USD, recurring monthly
     - **Yearly**: $180 USD, recurring yearly (save $60/year)
   - Add metadata: `tier: pro`

4. **Copy Price IDs** from each price and add to `.env`

### B. Configure Webhooks

1. **Navigate to**: Dashboard → Developers → Webhooks → Add endpoint
2. **Endpoint URL**: `https://your-domain.com/api/v1/stripe/webhook`
3. **Events to listen for**:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
4. **Copy webhook signing secret** → add to `.env` as `STRIPE_WEBHOOK_SECRET`

### C. Enable Test Mode

- Ensure you're in **Test Mode** (toggle in Dashboard)
- Use test cards: `4242 4242 4242 4242` (Visa)

---

## 3. Database Schema Updates

### A. Update `users` table

- Change `subscriptionTier` from `text` to proper enum
- Add Stripe-specific fields:
  - `stripeCustomerId` (text, unique, nullable)
  - `stripeSubscriptionId` (text, unique, nullable)
  - `subscriptionStatus` (enum: active, canceled, past_due, trialing)
  - `subscriptionPeriodEnd` (timestamp)

### B. Create `usage_metrics` table

```typescript
{
  id: uuid,
  userId: uuid (FK to users),
  month: text (YYYY-MM format),
  plansGenerated: integer,
  regenerationsUsed: integer,
  exportsUsed: integer,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

- Add unique constraint on `(userId, month)`
- Add indexes on `userId` and `month`

### C. Create migration

- Run `pnpm db:generate` to create migration
- Run `pnpm db:push` to apply changes

---

## 4. Code Implementation

### A. Install Dependencies

```bash
pnpm add stripe
```

### B. Create Stripe Client (`src/lib/stripe/client.ts`)

- Initialize Stripe SDK with secret key
- Export configured client

### C. Create Usage Tracking Service (`src/lib/stripe/usage.ts`)

- `checkPlanLimit(userId)` - verify if user can create more plans
- `checkRegenerationLimit(userId)` - verify monthly regenerations
- `checkExportLimit(userId)` - verify export quota
- `incrementUsage(userId, type)` - increment usage counters
- `resetMonthlyUsage()` - cron job to reset monthly counters

### D. Create Subscription Service (`src/lib/stripe/subscriptions.ts`)

- `getSubscriptionTier(userId)` - return current tier
- `syncSubscriptionToDb(subscription)` - update DB from webhook
- `createCustomer(userId, email)` - create Stripe customer
- `getCustomerPortalUrl(customerId)` - generate portal session

### E. Implement API Routes

**`/api/v1/stripe/create-checkout`** (POST)

- Accept: `{ priceId, successUrl?, cancelUrl? }`
- Create Stripe checkout session
- Link to user's Stripe customer (create if needed)
- Return: `{ sessionUrl }`

**`/api/v1/stripe/create-portal`** (POST)

- Get user's Stripe customer ID
- Create billing portal session
- Return: `{ portalUrl }`

**`/api/v1/stripe/webhook`** (POST)

- Verify webhook signature
- Handle events:
  - `checkout.session.completed` → update user subscription
  - `customer.subscription.updated` → sync subscription status
  - `customer.subscription.deleted` → downgrade to free tier
  - `invoice.payment_failed` → mark subscription as past_due
- Return 200 for all events

**`/api/v1/user/subscription`** (GET)

- Return user's current subscription details:
  - `tier`, `status`, `periodEnd`, `cancelAtPeriodEnd`
  - `usage`: current month's usage vs limits

### F. Add Gating Middleware (`src/lib/api/gates.ts`)

- `requireSubscription(tier)` - middleware to check tier access
- `checkFeatureLimit(feature)` - verify feature usage limits
- Integrate into existing plan/regeneration/export routes

---

## 5. Frontend Integration Points

### A. Upgrade CTAs

- Add "Upgrade" button to dashboard when limits reached
- Show current usage vs limits in sidebar/header
- Display subscription status badge

### B. Pricing Page (`/pricing`)

- Display three tiers: Free, Starter, Pro
- Feature comparison table
- "Subscribe" buttons → call `/api/v1/stripe/create-checkout`

### C. Settings Page (`/settings/billing`)

- Show current plan and usage
- "Manage Subscription" button → call `/api/v1/stripe/create-portal`
- Display next billing date

---

## 6. Testing Checklist

- [ ] Test checkout flow with test card
- [ ] Test webhook reception (use Stripe CLI: `stripe listen --forward-to localhost:3000/api/v1/stripe/webhook`)
- [ ] Test subscription limits enforcement
- [ ] Test upgrade/downgrade flows
- [ ] Test subscription cancellation
- [ ] Test usage reset at month boundary

---

## Implementation Order

1. **Setup** (30 min): Install stripe package, add env vars, configure Dashboard
2. **Database** (45 min): Update schema, create migration, apply changes
3. **Core Services** (2 hrs): Stripe client, usage tracking, subscription service
4. **API Routes** (2 hrs): Implement checkout, webhook, portal, subscription endpoints
5. **Gating Logic** (1 hr): Add middleware to enforce limits
6. **Testing** (1 hr): Manual testing with test cards and webhooks

**Total Estimate**: ~7 hours
