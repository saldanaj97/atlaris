import { LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID } from '@/lib/config/local-product-testing';
/**
 * Applies the canonical local product-testing seed after migrations.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';

const SEED_SQL_PATH = resolve(process.cwd(), 'supabase/seed.sql');

/** Executes `supabase/seed.sql` against a local Postgres connection. */
export async function seedLocalProductTestingUser(
  connectionUrl: string,
): Promise<void> {
  const sql = postgres(connectionUrl, { max: 1 });

  try {
    const seedSql = await readFile(SEED_SQL_PATH, 'utf8');
    if (!seedSql.includes(LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID)) {
      throw new Error('Local product-testing seed identity is missing');
    }
    await sql.unsafe(seedSql);
  } finally {
    await sql.end();
  }
}

export async function seedLocalProductTestingBillingFixture(
  connectionUrl: string,
): Promise<void> {
  const sql = postgres(connectionUrl, { max: 1 });
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 30);

  try {
    const updated = await sql`
      UPDATE users
      SET
        subscription_tier = 'pro'::subscription_tier,
        subscription_status = 'active'::subscription_status,
        subscription_period_end = ${periodEnd},
        cancel_at_period_end = false,
        updated_at = now()
      WHERE auth_user_id = ${LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID}
      RETURNING id
    `;

    if (updated.length !== 1) {
      throw new Error('Local product-testing billing fixture user is missing');
    }
  } finally {
    await sql.end();
  }
}
