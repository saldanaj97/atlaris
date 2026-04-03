/**
 * Infra-only validation: confirm the canonical product-testing user row exists.
 */
import postgres from 'postgres';

import { LOCAL_PRODUCT_TESTING_SEED_USER_ROW_ID } from '@/lib/config/local-product-testing';

export async function assertSeededSmokeUserPresent(
  connectionUrl: string
): Promise<void> {
  const sql = postgres(connectionUrl, { max: 1 });
  try {
    const rows = await sql<{ id: string }[]>`
      SELECT id::text FROM users
      WHERE id = ${LOCAL_PRODUCT_TESTING_SEED_USER_ROW_ID}::uuid
    `;
    if (rows.length !== 1) {
      throw new Error(
        `[smoke] Expected seeded user row ${LOCAL_PRODUCT_TESTING_SEED_USER_ROW_ID} in disposable DB`
      );
    }
  } finally {
    await sql.end();
  }
}
