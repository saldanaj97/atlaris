import {
  LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID,
  LOCAL_PRODUCT_TESTING_SEED_EMAIL,
  LOCAL_PRODUCT_TESTING_SEED_NAME,
  LOCAL_PRODUCT_TESTING_SEED_USER_ROW_ID,
} from '@/lib/config/local-product-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('local product-testing seed contract', () => {
  it('keeps the committed SQL seed aligned with the TypeScript identity', () => {
    const seedSql = readFileSync(resolve('supabase/seed.sql'), 'utf8');

    expect(seedSql).toContain(
      `'${LOCAL_PRODUCT_TESTING_SEED_USER_ROW_ID}'::uuid`,
    );
    expect(seedSql).toContain(`'${LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID}'`);
    expect(seedSql).toContain(`'${LOCAL_PRODUCT_TESTING_SEED_EMAIL}'`);
    expect(seedSql).toContain(`'${LOCAL_PRODUCT_TESTING_SEED_NAME}'`);
  });

  it('keeps the local environment example aligned with the seed identity', () => {
    const envExample = readFileSync(resolve('.env.local.example'), 'utf8');

    expect(envExample).toContain(
      `DEV_AUTH_USER_ID=${LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID}`,
    );
    expect(envExample).toContain(
      `DEV_AUTH_USER_EMAIL=${LOCAL_PRODUCT_TESTING_SEED_EMAIL}`,
    );
    expect(envExample).toContain(
      `DEV_AUTH_USER_NAME=${LOCAL_PRODUCT_TESTING_SEED_NAME}`,
    );
    expect(envExample).toContain('created by `pnpm db:dev:reset`');
  });
});
