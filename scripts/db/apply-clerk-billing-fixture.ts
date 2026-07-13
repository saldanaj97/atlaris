import type {
  ClerkBillingProjectionItem,
  ClerkBillingProjectionSource,
} from '@/features/billing/clerk-billing/projection';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  getPostgresHostname,
  isLocalPostgresHostname,
} from './local-postgres-host';
import {
  CLERK_BILLING_PLAN_IDS,
  CLERK_BILLING_PLAN_SLUGS,
} from '@/features/billing/clerk-billing/plan-mapping';
import {
  applyClerkBillingSource,
  type ClerkBillingApplyResult,
} from '@/features/billing/clerk-billing/reconciliation';
import { createLogger } from '@/lib/logging/logger';
import dotenv from 'dotenv';

type FixtureStatus = 'active' | 'past_due' | 'canceled' | 'ended';

const TIER_VALUES = new Set<SubscriptionTier>(['free', 'starter', 'pro']);
const STATUS_VALUES = new Set<FixtureStatus>([
  'active',
  'past_due',
  'canceled',
  'ended',
]);
function usage(): never {
  console.error(
    [
      'Usage:',
      '  pnpm billing:clerk:fixture -- --user-id <users.auth_user_id> --plan pro',
      '',
      'Options:',
      '  --user-id <auth-user-id>    Required value stored in users.auth_user_id',
      '  --plan <free|starter|pro>   Defaults to pro',
      '  --status <active|past_due|canceled|ended>   Defaults to active',
      '  --period-end <iso-date>     Defaults to 30 days from now for paid plans',
      '  --allow-non-local true      Allows writes to non-localhost Postgres',
    ].join('\n'),
  );
  process.exit(1);
}

function parseArgs(argv: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (!key?.startsWith('--') || !value || value.startsWith('--')) {
      usage();
    }

    parsed[key.slice(2)] = value;
    index += 1;
  }

  return parsed;
}

function parseTier(value: string | undefined): SubscriptionTier {
  const tier = value ?? 'pro';
  return TIER_VALUES.has(tier as SubscriptionTier)
    ? (tier as SubscriptionTier)
    : usage();
}

function parseStatus(value: string | undefined): FixtureStatus {
  const status = value ?? 'active';
  return STATUS_VALUES.has(status as FixtureStatus)
    ? (status as FixtureStatus)
    : usage();
}

function parsePeriodEnd(value: string | undefined, tier: SubscriptionTier) {
  if (value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      usage();
    }
    return parsed;
  }

  if (tier === 'free') {
    return null;
  }

  const defaultEnd = new Date();
  defaultEnd.setDate(defaultEnd.getDate() + 30);
  return defaultEnd;
}

function resolveDatabaseUrl(): string {
  const value = process.env.POSTGRES_URL?.trim();
  if (!value) {
    throw new Error(
      'POSTGRES_URL is required to apply Clerk Billing fixtures.',
    );
  }
  return value;
}

function assertLocalhostOnly(connectionUrl: string): void {
  const hostname = getPostgresHostname(connectionUrl);
  if (hostname === null) {
    throw new Error(
      'Invalid POSTGRES_URL: could not parse hostname (expected a postgresql:// URL).',
    );
  }

  if (!isLocalPostgresHostname(hostname)) {
    throw new Error(
      `Refusing to apply Clerk Billing fixture to non-local database (host: ${hostname}). Pass "--allow-non-local true" only when you intend to write there.`,
    );
  }
}

async function main(): Promise<void> {
  if (!process.env.CI) {
    dotenv.config({ path: '.env.local' });
  }

  const args = parseArgs(process.argv.slice(2));
  if (args['allow-non-local'] !== 'true') {
    assertLocalhostOnly(resolveDatabaseUrl());
  }

  const payerUserId = args['user-id'];
  if (!payerUserId) {
    usage();
  }

  const tier = parseTier(args.plan);
  const status = parseStatus(args.status);
  const periodEnd = parsePeriodEnd(args['period-end'], tier);
  const planId = CLERK_BILLING_PLAN_IDS[tier];
  const planSlug = CLERK_BILLING_PLAN_SLUGS[tier];
  const item: ClerkBillingProjectionItem = {
    id: `local_${tier}_${status}`,
    status,
    tier,
    planId,
    planSlug,
    amountInCents: tier === 'free' ? 0 : 2_000,
    periodEnd,
    isFreeTrial: false,
  };
  const source: ClerkBillingProjectionSource = {
    type: 'local-fixture.subscription',
    payerUserId,
    subscriptionStatus: status === 'ended' ? 'ended' : status,
    paymentAttemptStatus: null,
    items: [item],
  };

  const result: ClerkBillingApplyResult = await applyClerkBillingSource(
    source,
    { logger: createLogger({ script: 'apply-clerk-billing-fixture' }) },
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        result,
        userId: payerUserId,
        tier,
        status,
        periodEnd: periodEnd?.toISOString() ?? null,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
