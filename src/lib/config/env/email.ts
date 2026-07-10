import {
  createServerEnvAccess,
  type EnvSource,
  EnvValidationError,
  getProcessEnvSource,
  type ServerEnvAccess,
} from '@/lib/config/env/shared';

/**
 * Email delivery env. Send enablement is controlled by the
 * `email-notification-delivery` Vercel Flag; these getters only expose secrets.
 * Unsubscribe verification stays independent of the send flag.
 */
interface EmailEnv {
  readonly apiKey: string | undefined;
  readonly from: string | undefined;
  readonly replyTo: string | undefined;
  readonly unsubscribeTokenSecret: string | undefined;
}

const defaultEmailAccess = createServerEnvAccess(getProcessEnvSource);

function createEmailEnv(access: ServerEnvAccess): EmailEnv {
  return {
    get apiKey(): string | undefined {
      return access.getServerOptional('RESEND_API_KEY');
    },
    get from(): string | undefined {
      return access.getServerOptional('RESEND_FROM');
    },
    get replyTo(): string | undefined {
      return access.getServerOptional('RESEND_REPLY_TO');
    },
    get unsubscribeTokenSecret(): string | undefined {
      return access.getServerOptional('EMAIL_UNSUBSCRIBE_TOKEN_SECRET');
    },
  };
}

/**
 * Asserts delivery config is complete before sending.
 * Call only after the email-notification-delivery flag resolves true.
 */
export function assertEmailDeliveryConfig(env: EmailEnv = emailEnv): void {
  if (!env.apiKey) {
    throw new EnvValidationError(
      'Missing required environment variable: RESEND_API_KEY',
      'RESEND_API_KEY',
    );
  }
  if (!env.from) {
    throw new EnvValidationError(
      'Missing required environment variable: RESEND_FROM',
      'RESEND_FROM',
    );
  }
  if (!env.unsubscribeTokenSecret) {
    throw new EnvValidationError(
      'Missing required environment variable: EMAIL_UNSUBSCRIBE_TOKEN_SECRET',
      'EMAIL_UNSUBSCRIBE_TOKEN_SECRET',
    );
  }
}

export function createEmailEnvForTests(env: EnvSource): EmailEnv {
  return createEmailEnv(createServerEnvAccess(() => env));
}

export const emailEnv = createEmailEnv(defaultEmailAccess);
