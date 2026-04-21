import { getServerOptional, toBoolean } from '@/lib/config/env/shared';
import {
  LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID,
  LOCAL_PRODUCT_TESTING_SEED_EMAIL,
  LOCAL_PRODUCT_TESTING_SEED_NAME,
  LOCAL_PRODUCT_TESTING_SEED_USER_ROW_ID,
} from '@/lib/config/local-product-testing';

export const localProductTestingEnv = {
  /**
   * When true, the app is intended to run the local product-testing workflow (seeded users,
   * mocks per PRD). Always false in production (startup throws if misconfigured).
   */
  get enabled(): boolean {
    return toBoolean(getServerOptional('LOCAL_PRODUCT_TESTING'), false);
  },
  /** Deterministic seed user row identifiers; same values as `pnpm db:dev:bootstrap` inserts. */
  seed: {
    userRowId: LOCAL_PRODUCT_TESTING_SEED_USER_ROW_ID,
    authUserId: LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID,
    email: LOCAL_PRODUCT_TESTING_SEED_EMAIL,
    name: LOCAL_PRODUCT_TESTING_SEED_NAME,
  },
} as const;
