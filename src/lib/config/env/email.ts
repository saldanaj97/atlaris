import {
  createServerEnvAccess,
  type EnvSource,
  EnvValidationError,
  getProcessEnvSource,
  type ServerEnvAccess,
  toBoolean,
} from '@/lib/config/env/shared';

/**
 * Fail-closed email delivery env. Production sends stay off until
 * EMAIL_NOTIFICATIONS_ENABLED is explicitly true and required secrets are present.
 */
interface EmailEnv {
  readonly notificationsEnabled: boolean;
  readonly apiKey: string | undefined;
  readonly from: string | undefined;
  readonly replyTo: string | undefined;
  readonly unsubscribeTokenSecret: string | undefined;
}

const defaultEmailAccess = createServerEnvAccess(getProcessEnvSource);

function createEmailEnv(access: ServerEnvAccess): EmailEnv {
  return {
    get notificationsEnabled(): boolean {
      return toBoolean(
        access.getServerOptional('EMAIL_NOTIFICATIONS_ENABLED'),
        false,
      );
    },
    get apiKey(): string | undefined {
      if (!this.notificationsEnabled) {
        return undefined;
      }
      return access.getServerRequired('RESEND_API_KEY');
    },
    get from(): string | undefined {
      if (!this.notificationsEnabled) {
        return undefined;
      }
      return access.getServerRequired('RESEND_FROM');
    },
    get replyTo(): string | undefined {
      return access.getServerOptional('RESEND_REPLY_TO');
    },
    get unsubscribeTokenSecret(): string | undefined {
      if (!this.notificationsEnabled) {
        return undefined;
      }
      return access.getServerRequired('EMAIL_UNSUBSCRIBE_TOKEN_SECRET');
    },
  };
}

/**
 * Asserts delivery config is complete when the master switch is on.
 * Call from the maintenance route / delivery entry before sending.
 */
export function assertEmailDeliveryConfig(env: EmailEnv = emailEnv): void {
  if (!env.notificationsEnabled) {
    throw new EnvValidationError(
      'Email notifications are disabled.',
      'EMAIL_NOTIFICATIONS_ENABLED',
    );
  }
  // Touch getters so missing required vars fail closed before any send.
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
