import {
  assertEmailDeliveryConfig,
  createEmailEnvForTests,
} from '@/lib/config/env/email';
import { EnvValidationError } from '@/lib/config/env/shared';
import { describe, expect, it } from 'vitest';

describe('emailEnv', () => {
  it('defaults notificationsEnabled to false when unset', () => {
    const env = createEmailEnvForTests({ NODE_ENV: 'test' });
    expect(env.notificationsEnabled).toBe(false);
    expect(env.apiKey).toBeUndefined();
    expect(env.from).toBeUndefined();
    expect(env.unsubscribeTokenSecret).toBeUndefined();
  });

  it('does not require secrets when delivery is disabled', () => {
    const env = createEmailEnvForTests({
      NODE_ENV: 'test',
      EMAIL_NOTIFICATIONS_ENABLED: 'false',
    });
    expect(env.notificationsEnabled).toBe(false);
    expect(env.apiKey).toBeUndefined();
    expect(env.from).toBeUndefined();
    expect(env.unsubscribeTokenSecret).toBeUndefined();
  });

  it('requires RESEND_API_KEY, RESEND_FROM, and EMAIL_UNSUBSCRIBE_TOKEN_SECRET when enabled', () => {
    const env = createEmailEnvForTests({
      NODE_ENV: 'test',
      EMAIL_NOTIFICATIONS_ENABLED: 'true',
    });

    expect(env.notificationsEnabled).toBe(true);
    expect(() => env.apiKey).toThrow(EnvValidationError);
    expect(() => env.from).toThrow(EnvValidationError);
    expect(() => env.unsubscribeTokenSecret).toThrow(EnvValidationError);
  });

  it('exposes from via RESEND_FROM (not EMAIL_FROM)', () => {
    const env = createEmailEnvForTests({
      NODE_ENV: 'test',
      EMAIL_NOTIFICATIONS_ENABLED: 'true',
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Atlaris <notifications@mail.atlaris.app>',
      EMAIL_UNSUBSCRIBE_TOKEN_SECRET: 'secret',
      EMAIL_FROM: 'should-not-be-used@example.com',
    });

    expect(env.from).toBe('Atlaris <notifications@mail.atlaris.app>');
    expect(env.apiKey).toBe('re_test');
    expect(env.unsubscribeTokenSecret).toBe('secret');
  });

  it('treats RESEND_REPLY_TO as optional', () => {
    const withoutReply = createEmailEnvForTests({
      NODE_ENV: 'test',
      EMAIL_NOTIFICATIONS_ENABLED: 'true',
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Atlaris <notifications@mail.atlaris.app>',
      EMAIL_UNSUBSCRIBE_TOKEN_SECRET: 'secret',
    });
    expect(withoutReply.replyTo).toBeUndefined();

    const withReply = createEmailEnvForTests({
      NODE_ENV: 'test',
      EMAIL_NOTIFICATIONS_ENABLED: 'true',
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Atlaris <notifications@mail.atlaris.app>',
      RESEND_REPLY_TO: 'support@atlaris.app',
      EMAIL_UNSUBSCRIBE_TOKEN_SECRET: 'secret',
    });
    expect(withReply.replyTo).toBe('support@atlaris.app');
  });

  it('assertEmailDeliveryConfig fails closed when disabled', () => {
    const env = createEmailEnvForTests({ NODE_ENV: 'test' });
    expect(() => assertEmailDeliveryConfig(env)).toThrow(EnvValidationError);
  });

  it('assertEmailDeliveryConfig passes when fully configured', () => {
    const env = createEmailEnvForTests({
      NODE_ENV: 'test',
      EMAIL_NOTIFICATIONS_ENABLED: 'true',
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Atlaris <notifications@mail.atlaris.app>',
      EMAIL_UNSUBSCRIBE_TOKEN_SECRET: 'secret',
    });
    expect(() => assertEmailDeliveryConfig(env)).not.toThrow();
  });
});
