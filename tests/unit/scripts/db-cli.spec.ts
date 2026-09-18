import { DbCliUsageError, parseDbArgs } from '../../../scripts/db/cli';
import { LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID } from '@/lib/config/local-product-testing';
import { describe, expect, it } from 'vitest';

describe('pnpm db dispatcher', () => {
  it('maps local Supabase lifecycle commands to the checked-in CLI', () => {
    expect(parseDbArgs(['start'])).toEqual({
      executable: 'pnpm',
      args: ['exec', 'supabase', 'start'],
    });
    expect(parseDbArgs(['stop'])).toEqual({
      executable: 'pnpm',
      args: ['exec', 'supabase', 'stop'],
    });
    expect(parseDbArgs(['reset'])).toEqual({
      executable: 'pnpm',
      args: ['exec', 'supabase', 'db', 'reset'],
    });
    expect(parseDbArgs(['seed'])).toEqual({
      executable: 'pnpm',
      args: ['exec', 'tsx', 'scripts/db/seed-local-supabase.ts'],
    });
    expect(parseDbArgs(['migrate'])).toEqual({
      executable: 'pnpm',
      args: ['exec', 'drizzle-kit', 'migrate'],
    });
  });

  it('uses the deterministic product-testing user for shorthand fixtures', () => {
    expect(parseDbArgs(['fixture', 'starter'])).toEqual({
      executable: 'pnpm',
      args: [
        'exec',
        'tsx',
        'scripts/db/apply-clerk-billing-fixture.ts',
        '--user-id',
        LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID,
        '--plan',
        'starter',
      ],
    });
  });

  it('preserves explicit fixture options and the local-write safety boundary', () => {
    expect(
      parseDbArgs([
        'fixture',
        '--user-id',
        'user-custom',
        '--plan',
        'pro',
        '--status',
        'past_due',
        '--period-end',
        '2030-01-01T00:00:00.000Z',
      ]),
    ).toEqual({
      executable: 'pnpm',
      args: [
        'exec',
        'tsx',
        'scripts/db/apply-clerk-billing-fixture.ts',
        '--user-id',
        'user-custom',
        '--plan',
        'pro',
        '--status',
        'past_due',
        '--period-end',
        '2030-01-01T00:00:00.000Z',
      ],
    });
  });

  it('keeps cloud-agent and Clerk reconciliation commands behind db', () => {
    expect(parseDbArgs(['agent', 'status'])).toEqual({
      executable: 'pnpm',
      args: ['exec', 'tsx', 'scripts/agents/cloud-postgres.ts', 'status'],
    });
    expect(parseDbArgs(['reconcile-clerk', '--apply'])).toEqual({
      executable: 'pnpm',
      args: ['exec', 'tsx', 'scripts/db/reconcile-clerk-users.ts', '--apply'],
    });
  });

  it('rejects unsupported top-level commands and ambiguous fixture plans', () => {
    expect(() => parseDbArgs(['push'])).toThrow(DbCliUsageError);
    expect(() => parseDbArgs(['fixture', 'starter', '--plan', 'pro'])).toThrow(
      DbCliUsageError,
    );
    expect(() => parseDbArgs(['agent', 'status', 'extra'])).toThrow(
      DbCliUsageError,
    );
  });
});
