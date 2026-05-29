import {
  LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID,
  LOCAL_PRODUCT_TESTING_SEED_EMAIL,
  LOCAL_PRODUCT_TESTING_SEED_NAME,
  LOCAL_PRODUCT_TESTING_SEED_USER_ROW_ID,
} from '@/lib/config/local-product-testing';
/**
 * Inserts the canonical local product-testing user after migrations (service-role / postgres).
 * Idempotent: updates the deterministic seed row when it already exists.
 */
import postgres from 'postgres';

export async function seedLocalProductTestingUser(
  connectionUrl: string,
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
      ON CONFLICT (id) DO UPDATE SET
        auth_user_id = excluded.auth_user_id,
        email = excluded.email,
        name = excluded.name
    `;
  } finally {
    await sql.end();
  }
}
