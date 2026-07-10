import {
  assertEmailDeliveryConfig,
  createEmailEnvForTests,
} from '@/lib/config/env/email';
import { EnvValidationError } from '@/lib/config/env/shared';
import { describe, expect, it } from 'vitest';

describe('emailEnv', () => {
  it('exposes unsubscribe secret independently of send enablement', () => {
    const env = createEmailEnvForTests({
      NODE_ENV: 'test',
      EMAIL_UNSUBSCRIBE_TOKEN_SECRET: 'secret',
    });
    expect(env.unsubscribeTokenSecret).toBe('secret');
    expect(env.apiKey).toBeUndefined();
    expect(env.from).toBeUndefined();
  });

  it('returns undefined unsubscribe secret when missing', () => {
    const env = createEmailEnvForTests({
      NODE_ENV: 'test',
    });
    expect(env.unsubscribeTokenSecret).toBeUndefined();
  });

  it('exposes Resend fields independently when configured', () => {
    const env = createEmailEnvForTests({
      NODE_ENV: 'test',
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Atlaris <notifications@mail.atlaris.app>',
      EMAIL_UNSUBSCRIBE_TOKEN_SECRET: 'secret',
    });

    expect(env.apiKey).toBe('re_test');
    expect(env.from).toBe('Atlaris <notifications@mail.atlaris.app>');
    expect(env.unsubscribeTokenSecret).toBe('secret');
  });

  it('exposes from via RESEND_FROM (not EMAIL_FROM)', () => {
    const env = createEmailEnvForTests({
      NODE_ENV: 'test',
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Atlaris <notifications@mail.atlaris.app>',
      EMAIL_UNSUBSCRIBE_TOKEN_SECRET: 'secret',
      EMAIL_FROM: 'should-not-be-used@example.com',
    });

    expect(env.from).toBe('Atlaris <notifications@mail.atlaris.app>');
  });

  it('treats RESEND_REPLY_TO as optional', () => {
    const withoutReply = createEmailEnvForTests({
      NODE_ENV: 'test',
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Atlaris <notifications@mail.atlaris.app>',
      EMAIL_UNSUBSCRIBE_TOKEN_SECRET: 'secret',
    });
    expect(withoutReply.replyTo).toBeUndefined();

    const withReply = createEmailEnvForTests({
      NODE_ENV: 'test',
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Atlaris <notifications@mail.atlaris.app>',
      RESEND_REPLY_TO: 'support@atlaris.app',
      EMAIL_UNSUBSCRIBE_TOKEN_SECRET: 'secret',
    });
    expect(withReply.replyTo).toBe('support@atlaris.app');
  });

  it('assertEmailDeliveryConfig fails when secrets are missing', () => {
    const env = createEmailEnvForTests({ NODE_ENV: 'test' });
    expect(() => assertEmailDeliveryConfig(env)).toThrow(EnvValidationError);
  });

  it('assertEmailDeliveryConfig passes when fully configured', () => {
    const env = createEmailEnvForTests({
      NODE_ENV: 'test',
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Atlaris <notifications@mail.atlaris.app>',
      EMAIL_UNSUBSCRIBE_TOKEN_SECRET: 'secret',
    });
    expect(() => assertEmailDeliveryConfig(env)).not.toThrow();
  });

  it('assertEmailDeliveryConfig refuses to start without the unsubscribe secret', () => {
    const env = createEmailEnvForTests({
      NODE_ENV: 'test',
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'Atlaris <notifications@mail.atlaris.app>',
    });
    expect(() => assertEmailDeliveryConfig(env)).toThrow(EnvValidationError);
  });
});
