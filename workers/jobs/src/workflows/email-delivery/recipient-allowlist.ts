import type { WorkerEnv } from '../../env';

export type EmailRecipientGuard =
  /** Production: every eligible recipient may be sent to. */
  | { kind: 'unrestricted' }
  /** Outside production: only listed addresses may be sent to. */
  | { kind: 'allowlist'; canDeliverTo: (email: string) => boolean }
  /** Outside production with no list: nothing may be sent. */
  | { kind: 'unconfigured' };

/**
 * Staging safe-recipient guard. Outside production, only addresses in the
 * dashboard-managed `EMAIL_TEST_RECIPIENT_ALLOWLIST` (comma-separated,
 * case-insensitive) may receive email. Production ignores the variable.
 */
export function resolveEmailRecipientGuard(env: {
  WORKER_ENV: WorkerEnv['WORKER_ENV'];
  EMAIL_TEST_RECIPIENT_ALLOWLIST?: string;
}): EmailRecipientGuard {
  if (env.WORKER_ENV === 'production') {
    return { kind: 'unrestricted' };
  }

  const allowed = new Set(
    (env.EMAIL_TEST_RECIPIENT_ALLOWLIST ?? '')
      .split(',')
      .map((address) => address.trim().toLowerCase())
      .filter(Boolean),
  );
  if (allowed.size === 0) {
    return { kind: 'unconfigured' };
  }
  return {
    kind: 'allowlist',
    canDeliverTo: (email) => allowed.has(email.trim().toLowerCase()),
  };
}
