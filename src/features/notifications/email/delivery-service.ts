import type {
  EmailDeliveryRunRequest,
  EmailDeliveryRunResult,
  EmailSender,
} from './types';
import type { DbClient } from '@/lib/db/types';
import type { Logger } from '@/lib/logging/logger';

import { buildEmailContents, requiredActivityDateWindow } from './content';
import { EmailProviderError } from './resend-adapter';
import { createUnsubscribeToken } from './unsubscribe-token';
import { appEnv } from '@/lib/config/env/app';
import { emailEnv } from '@/lib/config/env/email';
import {
  findEmailDailyReminderPlanForUser,
  listEmailActivityDayKeysForUser,
} from '@/lib/db/queries/email-delivery-content';
import { listEmailDeliveryRecipients } from '@/lib/db/queries/email-delivery-recipients';
import {
  claimEmailNotificationDelivery,
  EmailDeliveryLostLeaseError,
  markEmailNotificationDeliveryFailed,
  markEmailNotificationDeliveryManualReview,
  markEmailNotificationDeliverySent,
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

type DeliveryDb = DbClient;

export type RunEmailNotificationDeliveryDeps = {
  db?: DeliveryDb;
  sender: EmailSender;
  logger?: Logger;
  appUrl?: string;
  unsubscribeSecret?: string;
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
    nextCursor: null,
  };
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
    throw new Error(
      'EMAIL_UNSUBSCRIBE_TOKEN_SECRET is required for signed unsubscribe links.',
    );
  }
  const now = deps.now ?? new Date();
  const batchSize = request.batchSize ?? DEFAULT_BATCH_SIZE;
  const counts = emptyCounts();

  const { recipients, nextCursor } = await listEmailDeliveryRecipients({
    batchSize,
    cursorUserId: request.cursorUserId,
    dbClient: db,
  });
  counts.nextCursor = nextCursor;

  const requested = new Set(request.categories);

  for (const recipient of recipients) {
    counts.examined += 1;

    const preferences = await getEmailNotificationPreferences(
      recipient.userId,
      db,
    );
    const effective = resolveEffectiveEmailPreferences(preferences);
    const enabledCategories = new Set(
      (Object.keys(effective) as Array<keyof typeof effective>).filter(
        (category) => effective[category] && requested.has(category),
      ),
    );

    if (enabledCategories.size === 0) {
      continue;
    }

    const userPrefs = await getUserPreferences(recipient.userId, db);
    const timeZone = normalizeTimeZone(userPrefs.analyticsTimezone);
    const todayLocalKey = dateKeyInTimeZone(now, timeZone);
    const dateWindow = requiredActivityDateWindow({
      todayLocalKey,
      enabledCategories,
    });

    const activityDayKeys = dateWindow
      ? await listEmailActivityDayKeysForUser({
          userId: recipient.userId,
          timeZone,
          startDateKeyInclusive: dateWindow.startDateKeyInclusive,
          endDateKeyExclusive: dateWindow.endDateKeyExclusive,
          dbClient: db,
        })
      : [];

    const incompletePlan = enabledCategories.has('daily_reminder')
      ? await findEmailDailyReminderPlanForUser(recipient.userId, db)
      : null;

    const unsubscribeToken = createUnsubscribeToken({
      userId: recipient.userId,
      secret,
    });
    const unsubscribeUrl = `${appUrl}/api/v1/notifications/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;

    const contents = buildEmailContents(
      {
        userId: recipient.userId,
        email: recipient.email,
        analyticsTimezone: userPrefs.analyticsTimezone,
        schedulerDateUtc: request.schedulerDateUtc,
        referenceDate: now,
        activityDayKeys,
        incompletePlan,
        appUrl,
        unsubscribeUrl,
      },
      enabledCategories,
    );

    let streakSentThisPass = false;

    for (const content of contents) {
      if (content.category === 'daily_reminder' && streakSentThisPass) {
        continue;
      }

      const candidateIdempotencyKey = `${recipient.userId}:${content.category}:${content.deliveryKey}`;
      const candidateRequest = deps.sender.resolveRequest({
        to: recipient.email,
        subject: content.message.subject,
        html: content.message.html,
        text: content.message.text,
        headers: content.message.headers,
        idempotencyKey: candidateIdempotencyKey,
      });

      const claim = await claimEmailNotificationDelivery(
        {
          userId: recipient.userId,
          category: content.category,
          deliveryKey: content.deliveryKey,
          providerRequest: candidateRequest,
          now,
        },
        db,
      );

      if (claim.outcome === 'already_terminal') {
        counts.alreadyTerminal += 1;
        continue;
      }
      if (claim.outcome === 'in_flight') {
        counts.inFlight += 1;
        continue;
      }
      if (claim.outcome === 'manual_review') {
        counts.manualReview += 1;
        countMetric('atlaris.email.notification.manual_review', 1, {
          attributes: {
            category: content.category,
            reason: 'provider_acceptance_ambiguous',
          },
        });
        deps.logger?.warn(
          {
            source: 'email_notifications',
            event: 'manual_review',
            category: content.category,
            failureClass: 'provider_acceptance_ambiguous',
          },
          'Email notification delivery requires manual review',
        );
        continue;
      }

      counts.claimed += 1;

      let sendResult;
      try {
        sendResult = await deps.sender.sendResolved(claim.providerRequest);
      } catch (err) {
        if (
          err instanceof EmailProviderError &&
          err.failureClass === 'provider_idempotency_conflict'
        ) {
          await markEmailNotificationDeliveryManualReview(
            {
              deliveryId: claim.deliveryId,
              claimToken: claim.claimToken,
              failureClass: err.failureClass,
            },
            db,
          );
          counts.manualReview += 1;
          countMetric('atlaris.email.notification.manual_review', 1, {
            attributes: {
              category: content.category,
              reason: err.failureClass,
            },
          });
          continue;
        }

        if (err instanceof EmailProviderError && err.outcome === 'rejected') {
          await markEmailNotificationDeliveryFailed(
            {
              deliveryId: claim.deliveryId,
              claimToken: claim.claimToken,
              failureClass: err.failureClass,
            },
            db,
          );
          counts.failed += 1;
          countMetric('atlaris.email.notification.failed', 1, {
            attributes: {
              category: content.category,
              reason: err.failureClass,
            },
          });
          deps.logger?.warn(
            {
              source: 'email_notifications',
              event: 'send_failed',
              category: content.category,
              failureClass: err.failureClass,
            },
            'Email notification send failed',
          );
          continue;
        }

        // Outcome-unknown transport failures keep the leased pending row for
        // safe recovery within the provider idempotency window.
        const failureClass =
          err instanceof EmailProviderError ? err.failureClass : 'send_failed';
        counts.failed += 1;
        countMetric('atlaris.email.notification.failed', 1, {
          attributes: { category: content.category, reason: failureClass },
        });
        deps.logger?.warn(
          {
            source: 'email_notifications',
            event: 'send_outcome_unknown',
            category: content.category,
            failureClass,
          },
          'Email notification send outcome unknown; lease retained',
        );
        continue;
      }

      try {
        await markEmailNotificationDeliverySent(
          {
            deliveryId: claim.deliveryId,
            claimToken: claim.claimToken,
            providerMessageId: sendResult.providerMessageId,
          },
          db,
        );
        counts.sent += 1;
        if (content.category === 'streak_reminder') {
          streakSentThisPass = true;
        }
        countMetric('atlaris.email.notification.sent', 1, {
          attributes: { category: content.category },
        });
      } catch (err) {
        // Provider accepted the message; never mark failed. Leave the lease
        // intact so a later reclaim can reuse the exact stored request.
        counts.failed += 1;
        countMetric('atlaris.email.notification.failed', 1, {
          attributes: {
            category: content.category,
            reason: 'ledger_finalization_failed',
          },
        });
        deps.logger?.error(
          {
            source: 'email_notifications',
            event: 'ledger_finalization_failed',
            category: content.category,
            lostLease: err instanceof EmailDeliveryLostLeaseError,
          },
          'Email accepted by provider but ledger finalization failed',
        );
      }
    }
  }

  deps.logger?.info(
    {
      source: 'email_notifications',
      event: 'delivery_pass_complete',
      ...counts,
      categories: request.categories,
      schedulerDateUtc: request.schedulerDateUtc,
    },
    'Email notification delivery pass complete',
  );

  return counts;
}
