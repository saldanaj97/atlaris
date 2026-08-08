import {
  assertLocalPreviewDatabaseHosts,
  assertLocalPreviewRequiredEnv,
  buildLocalPreviewProcessEnv,
  isConfirmedAtlarisDevPostgresUrl,
  LOCAL_PREVIEW_REQUIRED_ENV_NAMES,
  LocalPreviewLaunchError,
  prepareLocalPreviewEnv,
} from '../../../scripts/dev/local-preview/prepare-env';
import { describe, expect, it } from 'vitest';

const PROJECT_REF = 'abcdefghijklmnopqrsm';

function baseEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  const required: Record<string, string> = {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_x',
    CLERK_SECRET_KEY: 'sk_test_x',
    POSTGRES_URL: `postgresql://postgres.${PROJECT_REF}:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    POSTGRES_URL_NON_POOLING: `postgresql://postgres:secret@db.${PROJECT_REF}.supabase.co:5432/postgres`,
    AI_PROVIDER: 'mock',
    MOCK_AI_SCENARIO: 'success',
    MODULE_LESSON_WORKFLOW_ENABLED: 'true',
    PLAN_REGENERATION_WORKFLOW_ENABLED: 'true',
    PLAN_GENERATION_WORKFLOW_ENABLED: 'true',
    ENABLE_SENTRY: 'false',
    NEXT_PUBLIC_ENABLE_SENTRY: 'false',
    REGENERATION_QUEUE_ENABLED: 'false',
    REGENERATION_INLINE_PROCESSING: 'false',
  };

  return { ...required, ...overrides };
}

describe('isConfirmedAtlarisDevPostgresUrl', () => {
  it('accepts the direct atlaris-dev host', () => {
    expect(
      isConfirmedAtlarisDevPostgresUrl(
        `postgresql://postgres:secret@db.${PROJECT_REF}.supabase.co:5432/postgres`,
        PROJECT_REF,
      ),
    ).toBe(true);
  });

  it('accepts the pooler host when the username embeds the project ref', () => {
    expect(
      isConfirmedAtlarisDevPostgresUrl(
        `postgresql://postgres.${PROJECT_REF}:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
        PROJECT_REF,
      ),
    ).toBe(true);
  });

  it('rejects localhost and unknown hosts', () => {
    expect(
      isConfirmedAtlarisDevPostgresUrl(
        'postgresql://postgres:secret@127.0.0.1:54322/postgres',
        PROJECT_REF,
      ),
    ).toBe(false);
    expect(
      isConfirmedAtlarisDevPostgresUrl(
        'postgresql://postgres:secret@db.otherproject.supabase.co:5432/postgres',
        PROJECT_REF,
      ),
    ).toBe(false);
    expect(
      isConfirmedAtlarisDevPostgresUrl(
        'postgresql://postgres.other:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
        PROJECT_REF,
      ),
    ).toBe(false);
  });

  it('rejects when the project ref is unset', () => {
    expect(
      isConfirmedAtlarisDevPostgresUrl(
        `postgresql://postgres:secret@db.${PROJECT_REF}.supabase.co:5432/postgres`,
        '',
      ),
    ).toBe(false);
  });
});

describe('assertLocalPreviewRequiredEnv', () => {
  it('lists every missing required name without values', () => {
    expect(() => assertLocalPreviewRequiredEnv({})).toThrowError(
      LocalPreviewLaunchError,
    );
    try {
      assertLocalPreviewRequiredEnv({});
    } catch (error) {
      expect(error).toBeInstanceOf(LocalPreviewLaunchError);
      const message = (error as Error).message;
      for (const name of LOCAL_PREVIEW_REQUIRED_ENV_NAMES) {
        expect(message).toContain(name);
      }
      expect(message).not.toContain('sk_test');
      expect(message).not.toContain('secret');
    }
  });

  it('passes when all required names are present', () => {
    expect(() => assertLocalPreviewRequiredEnv(baseEnv())).not.toThrow();
  });
});

describe('assertLocalPreviewDatabaseHosts', () => {
  it('fails closed for a local database host', () => {
    expect(() =>
      assertLocalPreviewDatabaseHosts(
        baseEnv({
          POSTGRES_URL: 'postgresql://postgres:secret@127.0.0.1:54322/postgres',
          POSTGRES_URL_NON_POOLING:
            'postgresql://postgres:secret@127.0.0.1:54322/postgres',
        }),
        PROJECT_REF,
      ),
    ).toThrow(/not the confirmed atlaris-dev database/);
  });

  it('fails closed when the project ref constant is unset', () => {
    expect(() => assertLocalPreviewDatabaseHosts(baseEnv(), '')).toThrowError(
      /ATLARIS_DEV_SUPABASE_PROJECT_REF is unset/,
    );
  });
});

describe('buildLocalPreviewProcessEnv', () => {
  it('forces Local World overrides and clears fixture/hosted leakage', () => {
    const prepared = buildLocalPreviewProcessEnv(
      baseEnv({
        NODE_ENV: 'production',
        WORKFLOW_TARGET_WORLD: 'vercel',
        LOCAL_PRODUCT_TESTING: 'true',
        WORKFLOW_CALLBACK_TOKEN: 'token',
        DEV_AUTH_USER_ID: 'user_123',
        DEV_AUTH_USER_EMAIL: 'dev@example.com',
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'example.vercel.app',
      }),
    );

    expect(prepared.NODE_ENV).toBe('development');
    expect(prepared.WORKFLOW_TARGET_WORLD).toBe('local');
    expect(prepared.LOCAL_PRODUCT_TESTING).toBe('false');
    expect(prepared.WORKFLOW_CALLBACK_TOKEN).toBeUndefined();
    expect(prepared.DEV_AUTH_USER_ID).toBeUndefined();
    expect(prepared.DEV_AUTH_USER_EMAIL).toBeUndefined();
    expect(prepared.VERCEL).toBeUndefined();
    expect(prepared.VERCEL_ENV).toBeUndefined();
    expect(prepared.VERCEL_URL).toBeUndefined();
    expect(prepared.CLERK_SECRET_KEY).toBe('sk_test_x');
  });
});

describe('prepareLocalPreviewEnv', () => {
  it('returns the overridden env when validation passes', () => {
    const prepared = prepareLocalPreviewEnv(baseEnv(), PROJECT_REF);
    expect(prepared.WORKFLOW_TARGET_WORLD).toBe('local');
    expect(prepared.AI_PROVIDER).toBe('mock');
  });
});
