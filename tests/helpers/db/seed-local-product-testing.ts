/**
 * Inserts the canonical local product-testing user after migrations (service-role / postgres).
 * Idempotent: ON CONFLICT DO NOTHING on auth_user_id.
 */
import postgres from 'postgres';

import {
  LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID,
  LOCAL_PRODUCT_TESTING_SEED_EMAIL,
  LOCAL_PRODUCT_TESTING_SEED_NAME,
  LOCAL_PRODUCT_TESTING_SEED_USER_ROW_ID,
} from '@/lib/config/local-product-testing';

export async function seedLocalProductTestingUser(
  connectionUrl: string
): Promise<void> {
  const sql = postgres(connectionUrl, { max: 1 });

  try {
    await sql`
      INSERT INTO users (
        id,
        auth_user_id,
        email,
        name,
        subscription_tier,
        cancel_at_period_end,
        monthly_export_count
      )
      VALUES (
        ${LOCAL_PRODUCT_TESTING_SEED_USER_ROW_ID}::uuid,
        ${LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID},
        ${LOCAL_PRODUCT_TESTING_SEED_EMAIL},
        ${LOCAL_PRODUCT_TESTING_SEED_NAME},
        'free',
        false,
        0
      )
      ON CONFLICT (auth_user_id) DO NOTHING
    `;
  } finally {
    await sql.end();
  }
}
