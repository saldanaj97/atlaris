import type {
  EmailDeliveryRunRequest,
  EmailDeliveryRunResult,
  EmailSender,
} from './types';
import type { DbClient } from '@/lib/db/types';
import type { Logger } from '@/lib/logging/logger';

import { buildEmailContents } from './content';
import { EmailProviderError } from './resend-adapter';
import { createUnsubscribeToken } from './unsubscribe-token';
import { appEnv } from '@/lib/config/env/app';
import { emailEnv } from '@/lib/config/env/email';
import { listEmailDeliveryRecipients } from '@/lib/db/queries/email-delivery-recipients';
import {
  claimEmailNotificationDelivery,
  markEmailNotificationDeliveryFailed,
  markEmailNotificationDeliverySent,
  markEmailNotificationDeliverySkipped,
} from '@/lib/db/queries/email-notification-deliveries';
import { getLearningActivityEventsForUser } from '@/lib/db/queries/tasks';
import {
  getEmailNotificationPreferences,
  getUserPreferences,
} from '@/lib/db/queries/user-preferences';
import { countMetric } from '@/lib/observability/metrics';
import { resolveEffectiveEmailPreferences } from '@/shared/notifications/email-preferences';
import { learningPlans, modules, tasks, taskProgress } from '@supabase/schema';
import { db as serviceRoleDb } from '@supabase/service-role';
import { and, count, eq, sql } from 'drizzle-orm';

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

async function listIncompletePlansForUser(
  userId: string,
  dbClient: DeliveryDb,
): Promise<
  Array<{
    id: string;
    topic: string;
    completedTasks: number;
    totalTasks: number;
  }>
> {
  const rows = await dbClient
    .select({
      id: learningPlans.id,
      topic: learningPlans.topic,
      totalTasks: count(tasks.id),
      completedTasks: sql<number>`coalesce(sum(case when ${taskProgress.status} = 'completed' then 1 else 0 end), 0)`,
    })
    .from(learningPlans)
    .leftJoin(modules, eq(modules.planId, learningPlans.id))
    .leftJoin(tasks, eq(tasks.moduleId, modules.id))
    .leftJoin(
      taskProgress,
      and(
        eq(taskProgress.taskId, tasks.id),
        eq(taskProgress.userId, learningPlans.userId),
      ),
    )
    .where(
      and(
        eq(learningPlans.userId, userId),
        eq(learningPlans.generationStatus, 'ready'),
      ),
    )
    .groupBy(learningPlans.id, learningPlans.topic);

  return rows
    .map((row) => ({
      id: row.id,
      topic: row.topic,
      totalTasks: Number(row.totalTasks),
      completedTasks: Number(row.completedTasks),
    }))
    .filter((row) => row.totalTasks > 0 && row.completedTasks < row.totalTasks);
}

function emptyCounts(): EmailDeliveryRunResult {
  return {
    examined: 0,
    claimed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    alreadyTerminal: 0,
    inFlight: 0,
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
    const activityEvents = await getLearningActivityEventsForUser(
      recipient.userId,
      db,
    );
    const incompletePlans = await listIncompletePlansForUser(
      recipient.userId,
      db,
    );

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
        activityEvents,
        incompletePlans,
        appUrl,
        unsubscribeUrl,
      },
      enabledCategories,
    );

    for (const content of contents) {
      const claim = await claimEmailNotificationDelivery(
        {
          userId: recipient.userId,
          category: content.category,
          deliveryKey: content.deliveryKey,
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

      counts.claimed += 1;
      const idempotencyKey = `${recipient.userId}:${content.category}:${content.deliveryKey}`;

      try {
        const sendResult = await deps.sender.send({
          to: recipient.email,
          subject: content.message.subject,
          html: content.message.html,
          text: content.message.text,
          headers: content.message.headers,
          idempotencyKey,
        });

        await markEmailNotificationDeliverySent(
          claim.deliveryId,
          sendResult.providerMessageId,
          db,
        );
        counts.sent += 1;
        countMetric('atlaris.email.notification.sent', 1, {
          attributes: { category: content.category },
        });
      } catch (err) {
        const failureClass =
          err instanceof EmailProviderError ? err.failureClass : 'send_failed';

        // Validation / permanent-looking issues become skipped (terminal);
        // transient provider errors stay failed (retryable same key).
        if (failureClass === 'provider_validation') {
          await markEmailNotificationDeliverySkipped(
            claim.deliveryId,
            failureClass,
            db,
          );
          counts.skipped += 1;
          countMetric('atlaris.email.notification.skipped', 1, {
            attributes: { category: content.category, reason: failureClass },
          });
        } else {
          await markEmailNotificationDeliveryFailed(
            claim.deliveryId,
            failureClass,
            db,
          );
          counts.failed += 1;
          countMetric('atlaris.email.notification.failed', 1, {
            attributes: { category: content.category, reason: failureClass },
          });
          deps.logger?.warn(
            {
              source: 'email_notifications',
              event: 'send_failed',
              category: content.category,
              failureClass,
            },
            'Email notification send failed',
          );
        }
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
