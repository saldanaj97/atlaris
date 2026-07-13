import type { BuiltEmailContent } from './content';
import type {
  EmailDeliveryRunRequest,
  EmailDeliveryRunResult,
  EmailSender,
} from './types';
import type { DbClient } from '@/lib/db/types';
import type { Logger } from '@/lib/logging/logger';
import type { EmailNotificationCategory } from '@/shared/types/db.types';

import { buildEmailContents, requiredActivityDateWindow } from './content';
import { EmailProviderError } from './resend-adapter';
import { createUnsubscribeToken } from './unsubscribe-token';
import { appEnv } from '@/lib/config/env/app';
import { emailEnv } from '@/lib/config/env/email';
import { EnvValidationError } from '@/lib/config/env/shared';
import {
  findEmailDailyReminderPlanForUser,
  listEmailActivityDayKeysForUser,
} from '@/lib/db/queries/email-delivery-content';
import {
  listEmailDeliveryRecipients,
  type EmailDeliveryRecipient,
} from '@/lib/db/queries/email-delivery-recipients';
import {
  claimEmailNotificationDelivery,
  EMAIL_DELIVERY_LEASE_MS,
  type EmailDeliveryClaimResult,
  EmailDeliveryLostLeaseError,
  markEmailNotificationDeliveryFailed,
  markEmailNotificationDeliveryManualReview,
  markEmailNotificationDeliverySent,
  markEmailNotificationDeliverySkipped,
} from '@/lib/db/queries/email-notification-deliveries';
import {
  getEmailNotificationPreferences,
  getUserPreferences,
} from '@/lib/db/queries/user-preferences';
import { countMetric } from '@/lib/observability/metrics';
import {
  dateKeyInTimeZone,
  normalizeTimeZone,
} from '@/shared/analytics/learning-activity-time';
import { resolveEffectiveEmailPreferences } from '@/shared/notifications/email-preferences';
import { db as serviceRoleDb } from '@supabase/service-role';

const DEFAULT_BATCH_SIZE = 50;
const RETRYABLE_PROVIDER_BACKOFF_MS = 60 * 1000;
const RETRYABLE_DATABASE_ERROR_CODES = new Set([
  '40001',
  '40P01',
  '53300',
  '55P03',
  '57P01',
  '57P02',
  '57P03',
  'CONNECTION_CLOSED',
  'CONNECTION_DESTROYED',
  'CONNECTION_ENDED',
  'CONNECT_TIMEOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
]);

type DeliveryDb = DbClient;

function isRetryableDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return (
    typeof code === 'string' &&
    (code.startsWith('08') || RETRYABLE_DATABASE_ERROR_CODES.has(code))
  );
}

class EmailDeliveryPersistenceError extends Error {
  constructor() {
    super('Email delivery persistence failed');
    this.name = 'EmailDeliveryPersistenceError';
  }
}

async function persistDeliveryState<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new EmailDeliveryPersistenceError();
  }
}

export type RunEmailNotificationDeliveryDeps = {
  db?: DeliveryDb;
  sender: EmailSender;
  logger?: Logger;
  appUrl?: string;
  unsubscribeSecret?: string;
  /** Wall-clock time for ledger leases; defaults to the content reference time. */
  deliveryNow?: Date;
  /** Deterministic logical reference time for content and eligibility. */
  now?: Date;
};

function emptyCounts(): EmailDeliveryRunResult {
  return {
    examined: 0,
    claimed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    alreadyTerminal: 0,
    inFlight: 0,
    manualReview: 0,
    recipientErrors: 0,
    nextCursor: null,
    pageFailure: null,
    needsReview: false,
  };
}

function recordDeliveryFailure(
  counts: EmailDeliveryRunResult,
  failureClass: string,
  category?: EmailNotificationCategory,
): void {
  counts.failed += 1;
  countMetric('atlaris.email.notification.failed', 1, {
    attributes: category
      ? { category, reason: failureClass }
      : { reason: failureClass },
  });
}

async function buildRecipientEmailContents(args: {
  recipient: EmailDeliveryRecipient;
  requested: ReadonlySet<EmailNotificationCategory>;
  request: EmailDeliveryRunRequest;
  db: DeliveryDb;
  appUrl: string;
  secret: string;
  now: Date;
  deliveryNow: Date;
}): Promise<BuiltEmailContent[]> {
  const preferences = await getEmailNotificationPreferences(
    args.recipient.userId,
    args.db,
  );
  const effective = resolveEffectiveEmailPreferences(preferences);
  const enabledCategories = new Set(
    (Object.keys(effective) as Array<keyof typeof effective>).filter(
      (category) => effective[category] && args.requested.has(category),
    ),
  );

  if (enabledCategories.size === 0) {
    return [];
  }

  const userPrefs = await getUserPreferences(args.recipient.userId, args.db);
  const timeZone = normalizeTimeZone(userPrefs.analyticsTimezone);
  const todayLocalKey = dateKeyInTimeZone(args.now, timeZone);
  const dateWindow = requiredActivityDateWindow({
    todayLocalKey,
    enabledCategories,
  });
  const activityDayKeys = dateWindow
    ? await listEmailActivityDayKeysForUser({
        userId: args.recipient.userId,
        timeZone,
        startDateKeyInclusive: dateWindow.startDateKeyInclusive,
        endDateKeyExclusive: dateWindow.endDateKeyExclusive,
        dbClient: args.db,
      })
    : [];
  const incompletePlan = enabledCategories.has('daily_reminder')
    ? await findEmailDailyReminderPlanForUser(args.recipient.userId, args.db)
    : null;
  const unsubscribeToken = createUnsubscribeToken({
    userId: args.recipient.userId,
    secret: args.secret,
    nowMs: args.deliveryNow.getTime(),
  });

  return buildEmailContents(
    {
      userId: args.recipient.userId,
      email: args.recipient.email,
      analyticsTimezone: userPrefs.analyticsTimezone,
      schedulerDateUtc: args.request.schedulerDateUtc,
      referenceDate: args.now,
      activityDayKeys,
      incompletePlan,
      appUrl: args.appUrl,
      unsubscribeUrl: `${args.appUrl}/api/v1/notifications/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`,
    },
    enabledCategories,
  );
}

function handleUnclaimedDelivery(
  claim: Exclude<EmailDeliveryClaimResult, { outcome: 'claimed' }>,
  content: BuiltEmailContent,
  counts: EmailDeliveryRunResult,
  logger: Logger | undefined,
  streakSentThisPass: boolean,
): { action: 'continue' | 'stop'; streakSentThisPass: boolean } {
  if (claim.outcome === 'already_terminal') {
    counts.alreadyTerminal += 1;
    return {
      action: 'continue',
      streakSentThisPass:
        streakSentThisPass ||
        (content.category === 'streak_reminder' && claim.status === 'sent'),
    };
  }

  if (claim.outcome === 'in_flight') {
    counts.inFlight += 1;
    counts.pageFailure = {
      kind: 'retryable',
      failureClass: 'delivery_in_flight',
      retryAfterMs: EMAIL_DELIVERY_LEASE_MS,
    };
    return { action: 'stop', streakSentThisPass };
  }

  counts.manualReview += 1;
  counts.needsReview = true;
  countMetric('atlaris.email.notification.manual_review', 1, {
    attributes: {
      category: content.category,
      reason: 'provider_acceptance_ambiguous',
    },
  });
  logger?.warn(
    {
      source: 'email_notifications',
      event: 'manual_review',
      category: content.category,
      failureClass: 'provider_acceptance_ambiguous',
    },
    'Email notification delivery requires manual review',
  );
  return { action: 'continue', streakSentThisPass };
}

type ProviderFailure =
  | { kind: 'manual_review'; failureClass: string }
  | { kind: 'retryable'; failureClass: string }
  | { kind: 'rejected'; failureClass: string; terminal: boolean }
  | { kind: 'unknown'; failureClass: string };

function classifyProviderFailure(error: unknown): ProviderFailure {
  if (!(error instanceof EmailProviderError)) {
    return { kind: 'unknown', failureClass: 'send_failed' };
  }
  if (error.failureClass === 'provider_idempotency_conflict') {
    return { kind: 'manual_review', failureClass: error.failureClass };
  }
  if (error.outcome === 'retryable') {
    return { kind: 'retryable', failureClass: error.failureClass };
  }
  if (error.outcome === 'rejected') {
    return {
      kind: 'rejected',
      failureClass: error.failureClass,
      terminal: error.failureClass !== 'provider_recipient_invalid',
    };
  }
  return { kind: 'unknown', failureClass: error.failureClass };
}

async function handleProviderFailure(args: {
  failure: ProviderFailure;
  claim: Extract<EmailDeliveryClaimResult, { outcome: 'claimed' }>;
  category: EmailNotificationCategory;
  db: DeliveryDb;
  counts: EmailDeliveryRunResult;
  logger: Logger | undefined;
}): Promise<'continue' | 'stop'> {
  const { failure, claim, category, db, counts, logger } = args;

  switch (failure.kind) {
    case 'manual_review': {
      await persistDeliveryState(() =>
        markEmailNotificationDeliveryManualReview(
          {
            deliveryId: claim.deliveryId,
            claimToken: claim.claimToken,
            failureClass: failure.failureClass,
          },
          db,
        ),
      );
      counts.manualReview += 1;
      counts.needsReview = true;
      countMetric('atlaris.email.notification.manual_review', 1, {
        attributes: { category, reason: failure.failureClass },
      });
      return 'continue';
    }
    case 'retryable': {
      await persistDeliveryState(() =>
        markEmailNotificationDeliveryFailed(
          {
            deliveryId: claim.deliveryId,
            claimToken: claim.claimToken,
            failureClass: failure.failureClass,
          },
          db,
        ),
      );
      recordDeliveryFailure(counts, failure.failureClass, category);
      counts.pageFailure = {
        kind: 'retryable',
        failureClass: failure.failureClass,
        retryAfterMs: RETRYABLE_PROVIDER_BACKOFF_MS,
      };
      logger?.warn(
        {
          source: 'email_notifications',
          event: 'send_retryable_failure',
          category,
          failureClass: failure.failureClass,
        },
        'Email notification send failed; retry scheduled',
      );
      return 'stop';
    }
    case 'rejected': {
      await persistDeliveryState(() =>
        markEmailNotificationDeliveryFailed(
          {
            deliveryId: claim.deliveryId,
            claimToken: claim.claimToken,
            failureClass: failure.failureClass,
          },
          db,
        ),
      );
      recordDeliveryFailure(counts, failure.failureClass, category);
      logger?.warn(
        {
          source: 'email_notifications',
          event: failure.terminal
            ? 'send_terminal_failure'
            : 'send_recipient_failure',
          category,
          failureClass: failure.failureClass,
        },
        failure.terminal
          ? 'Email notification send failed permanently'
          : 'Email notification send failed for recipient',
      );
      if (failure.terminal) {
        counts.pageFailure = {
          kind: 'terminal',
          failureClass: failure.failureClass,
        };
        return 'stop';
      }
      return 'continue';
    }
    case 'unknown': {
      recordDeliveryFailure(counts, failure.failureClass, category);
      counts.pageFailure = {
        kind: 'retryable',
        failureClass: failure.failureClass,
        retryAfterMs: EMAIL_DELIVERY_LEASE_MS,
      };
      logger?.warn(
        {
          source: 'email_notifications',
          event: 'send_outcome_unknown',
          category,
          failureClass: failure.failureClass,
        },
        'Email notification send outcome unknown; lease retained',
      );
      return 'stop';
    }
    default: {
      const _exhaustive: never = failure;
      throw new Error(
        `Unhandled provider failure: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}

type EmailDeliveryPassContext = {
  db: DeliveryDb;
  sender: EmailSender;
  logger: Logger | undefined;
  request: EmailDeliveryRunRequest;
  requested: ReadonlySet<EmailNotificationCategory>;
  appUrl: string;
  secret: string;
  now: Date;
  deliveryNow: Date;
  counts: EmailDeliveryRunResult;
};

type DeliveryContentResult = {
  action: 'continue' | 'stop';
  streakSentThisPass: boolean;
};

async function processEmailContent(args: {
  recipient: EmailDeliveryRecipient;
  content: BuiltEmailContent;
  streakSentThisPass: boolean;
  context: EmailDeliveryPassContext;
}): Promise<DeliveryContentResult> {
  const { recipient, content, context } = args;
  const candidateRequest = context.sender.resolveRequest({
    to: recipient.email,
    subject: content.message.subject,
    html: content.message.html,
    text: content.message.text,
    headers: content.message.headers,
    idempotencyKey: `${recipient.userId}:${content.category}:${content.deliveryKey}`,
  });
  const claim = await persistDeliveryState(() =>
    claimEmailNotificationDelivery(
      {
        userId: recipient.userId,
        category: content.category,
        deliveryKey: content.deliveryKey,
        providerRequest: candidateRequest,
        now: context.deliveryNow,
      },
      context.db,
    ),
  );

  if (claim.outcome !== 'claimed') {
    return handleUnclaimedDelivery(
      claim,
      content,
      context.counts,
      context.logger,
      args.streakSentThisPass,
    );
  }

  context.counts.claimed += 1;
  if (content.category === 'daily_reminder' && args.streakSentThisPass) {
    await persistDeliveryState(() =>
      markEmailNotificationDeliverySkipped(
        {
          deliveryId: claim.deliveryId,
          claimToken: claim.claimToken,
          failureClass: 'suppressed_by_streak_reminder',
        },
        context.db,
      ),
    );
    context.counts.skipped += 1;
    countMetric('atlaris.email.notification.skipped', 1, {
      attributes: {
        category: content.category,
        reason: 'suppressed_by_streak_reminder',
      },
    });
    return { action: 'continue', streakSentThisPass: args.streakSentThisPass };
  }

  let sendResult: Awaited<ReturnType<EmailSender['sendResolved']>>;
  try {
    sendResult = await context.sender.sendResolved(claim.providerRequest);
  } catch (error) {
    return {
      action: await handleProviderFailure({
        failure: classifyProviderFailure(error),
        claim,
        category: content.category,
        db: context.db,
        counts: context.counts,
        logger: context.logger,
      }),
      streakSentThisPass: args.streakSentThisPass,
    };
  }

  const streakSentThisPass =
    args.streakSentThisPass || content.category === 'streak_reminder';
  try {
    await persistDeliveryState(() =>
      markEmailNotificationDeliverySent(
        {
          deliveryId: claim.deliveryId,
          claimToken: claim.claimToken,
          providerMessageId: sendResult.providerMessageId,
        },
        context.db,
      ),
    );
    context.counts.sent += 1;
    countMetric('atlaris.email.notification.sent', 1, {
      attributes: { category: content.category },
    });
  } catch (error) {
    // Provider accepted the message; never mark failed. Leave the lease
    // intact so a later reclaim can reuse the exact stored request.
    recordDeliveryFailure(
      context.counts,
      'ledger_finalization_failed',
      content.category,
    );
    context.logger?.error(
      {
        source: 'email_notifications',
        event: 'ledger_finalization_failed',
        category: content.category,
        lostLease: error instanceof EmailDeliveryLostLeaseError,
      },
      'Email accepted by provider but ledger finalization failed',
    );
    context.counts.pageFailure = {
      kind: 'retryable',
      failureClass: 'ledger_finalization_failed',
      retryAfterMs: EMAIL_DELIVERY_LEASE_MS,
    };
    return { action: 'stop', streakSentThisPass };
  }

  return { action: 'continue', streakSentThisPass };
}

/**
 * Preference-gated, ledger-idempotent email delivery pass.
 * Service-role only; call from the maintenance worker route.
 */
export async function runEmailNotificationDelivery(
  request: EmailDeliveryRunRequest,
  deps: RunEmailNotificationDeliveryDeps,
): Promise<EmailDeliveryRunResult> {
  // Config assert lives on the route/factory; this service stays injectable for tests.
  const db = deps.db ?? serviceRoleDb;
  const appUrl = (deps.appUrl ?? appEnv.url).replace(/\/$/, '');
  const secret =
    deps.unsubscribeSecret ?? emailEnv.unsubscribeTokenSecret ?? '';
  if (!secret) {
    throw new EnvValidationError(
      'Missing required environment variable: EMAIL_UNSUBSCRIBE_TOKEN_SECRET',
      'EMAIL_UNSUBSCRIBE_TOKEN_SECRET',
    );
  }
  const now = deps.now ?? new Date();
  const deliveryNow = deps.deliveryNow ?? now;
  const batchSize = request.batchSize ?? DEFAULT_BATCH_SIZE;
  const counts = emptyCounts();

  const { recipients, nextCursor } = await listEmailDeliveryRecipients({
    batchSize,
    cursorUserId: request.cursorUserId,
    dbClient: db,
  });
  counts.nextCursor = nextCursor;

  const requested = new Set(request.categories);
  const context: EmailDeliveryPassContext = {
    db,
    sender: deps.sender,
    logger: deps.logger,
    request,
    requested,
    appUrl,
    secret,
    now,
    deliveryNow,
    counts,
  };

  recipients: for (const recipient of recipients) {
    counts.examined += 1;
    try {
      const contents = await buildRecipientEmailContents({
        recipient,
        requested: context.requested,
        request: context.request,
        db: context.db,
        appUrl: context.appUrl,
        secret: context.secret,
        now: context.now,
        deliveryNow: context.deliveryNow,
      });
      let streakSentThisPass = false;

      for (const content of contents) {
        const result = await processEmailContent({
          recipient,
          content,
          streakSentThisPass,
          context,
        });
        streakSentThisPass = result.streakSentThisPass;
        if (result.action === 'stop') {
          break recipients;
        }
      }
    } catch (error) {
      if (
        error instanceof EmailDeliveryPersistenceError ||
        isRetryableDatabaseError(error)
      ) {
        throw error;
      }
      recordDeliveryFailure(counts, 'recipient_processing_error');
      counts.recipientErrors += 1;
      counts.needsReview = true;
      deps.logger?.error(
        {
          source: 'email_notifications',
          event: 'recipient_processing_error',
          failureClass: 'recipient_processing_error',
        },
        'Email notification recipient processing failed; skipping user',
      );
    }
  }

  const { nextCursor: _nextCursor, ...loggedCounts } = counts;
  deps.logger?.info(
    {
      source: 'email_notifications',
      event: 'delivery_pass_complete',
      ...loggedCounts,
      hasNextCursor: counts.nextCursor !== null,
      categories: request.categories,
      schedulerDateUtc: request.schedulerDateUtc,
    },
    'Email notification delivery pass complete',
  );

  return counts;
}
