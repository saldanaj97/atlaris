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
const EMAIL_UNSUBSCRIBE_TOKEN_SECRET_ENV_KEY = 'EMAIL_UNSUBSCRIBE_TOKEN_SECRET';
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

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
  getRequiredEmailUnsubscribeTokenSecret(env);
}

/**
 * Requires an unpadded base64url secret encoding at least 32 random bytes.
 * The format is shared by email delivery and public unsubscribe verification.
 */
export function getRequiredEmailUnsubscribeTokenSecret(
  env: EmailEnv = emailEnv,
): string {
  const secret = env.unsubscribeTokenSecret;
  if (!secret || !BASE64URL_PATTERN.test(secret)) {
    throw new EnvValidationError(
      'EMAIL_UNSUBSCRIBE_TOKEN_SECRET must be unpadded base64url encoding at least 32 random bytes',
      EMAIL_UNSUBSCRIBE_TOKEN_SECRET_ENV_KEY,
    );
  }

  const decoded = Buffer.from(secret, 'base64url');
  if (decoded.length < 32 || decoded.toString('base64url') !== secret) {
    throw new EnvValidationError(
      'EMAIL_UNSUBSCRIBE_TOKEN_SECRET must be unpadded base64url encoding at least 32 random bytes',
      EMAIL_UNSUBSCRIBE_TOKEN_SECRET_ENV_KEY,
    );
  }

  return secret;
}

export function createEmailEnvForTests(env: EnvSource): EmailEnv {
  return createEmailEnv(createServerEnvAccess(() => env));
}

export const emailEnv = createEmailEnv(defaultEmailAccess);
