import {
  getShellAuthUserId,
  isLocalProductTestingAuthEnabled,
  shouldUseClerkUi,
} from '@/lib/auth/local-identity';
import { afterEach, describe, expect, it, vi } from 'vitest';

const localAuthUserId = '00000000-0000-4000-8000-000000000001';

describe('getShellAuthUserId', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns session user id when local product testing is off', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LOCAL_PRODUCT_TESTING', 'false');
    vi.stubEnv('DEV_AUTH_USER_ID', localAuthUserId);
    expect(getShellAuthUserId('session-id')).toBe('session-id');
  });

  it('returns DEV_AUTH_USER_ID when local product testing is on in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LOCAL_PRODUCT_TESTING', 'true');
    vi.stubEnv('DEV_AUTH_USER_ID', localAuthUserId);
    expect(getShellAuthUserId(undefined)).toBe(localAuthUserId);
  });
});

describe('local identity helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    {
      nodeEnv: 'development',
      localProductTesting: 'true',
      devAuthUserId: localAuthUserId,
      expected: true,
    },
    {
      nodeEnv: 'development',
      localProductTesting: 'true',
      devAuthUserId: 'seed-id',
      expected: true,
    },
    {
      nodeEnv: 'development',
      localProductTesting: 'true',
      devAuthUserId: '',
      expected: false,
    },
    {
      nodeEnv: 'development',
      localProductTesting: 'false',
      devAuthUserId: localAuthUserId,
      expected: false,
    },
    {
      nodeEnv: 'production',
      localProductTesting: 'true',
      devAuthUserId: localAuthUserId,
      expected: false,
    },
    {
      nodeEnv: 'test',
      localProductTesting: 'true',
      devAuthUserId: localAuthUserId,
      expected: false,
    },
    {
      nodeEnv: 'test',
      localProductTesting: 'true',
      devAuthUserId: '',
      expected: false,
    },
    {
      nodeEnv: 'test',
      localProductTesting: 'true',
      devAuthUserId: undefined,
      expected: false,
    },
  ])(
    'reports local product-testing auth as $expected for NODE_ENV=$nodeEnv LOCAL_PRODUCT_TESTING=$localProductTesting DEV_AUTH_USER_ID=$devAuthUserId',
    ({ nodeEnv, localProductTesting, devAuthUserId, expected }) => {
      vi.stubEnv('NODE_ENV', nodeEnv);
      vi.stubEnv('LOCAL_PRODUCT_TESTING', localProductTesting);
      vi.stubEnv('DEV_AUTH_USER_ID', devAuthUserId);

      expect(isLocalProductTestingAuthEnabled()).toBe(expected);
    },
  );

  it.each([
    {
      nodeEnv: 'development',
      localProductTesting: 'true',
      devAuthUserId: localAuthUserId,
      expected: false,
    },
    {
      nodeEnv: 'development',
      localProductTesting: 'true',
      devAuthUserId: 'seed-id',
      expected: false,
    },
    {
      nodeEnv: 'development',
      localProductTesting: 'true',
      devAuthUserId: '',
      expected: true,
    },
    {
      nodeEnv: 'development',
      localProductTesting: 'false',
      devAuthUserId: localAuthUserId,
      expected: true,
    },
    {
      nodeEnv: 'production',
      localProductTesting: 'true',
      devAuthUserId: localAuthUserId,
      expected: true,
    },
    {
      nodeEnv: 'test',
      localProductTesting: 'true',
      devAuthUserId: localAuthUserId,
      expected: true,
    },
  ])(
    'shouldUseClerkUi returns $expected when NODE_ENV=$nodeEnv LOCAL_PRODUCT_TESTING=$localProductTesting DEV_AUTH_USER_ID=$devAuthUserId',
    ({ nodeEnv, localProductTesting, devAuthUserId, expected }) => {
      vi.stubEnv('NODE_ENV', nodeEnv);
      vi.stubEnv('LOCAL_PRODUCT_TESTING', localProductTesting);
      vi.stubEnv('DEV_AUTH_USER_ID', devAuthUserId);

      expect(shouldUseClerkUi()).toBe(expected);
    },
  );
});
