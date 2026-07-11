import type {
  EmailDeliveryRunCounts,
  PersistedProviderRequest,
} from '@/shared/notifications/email-delivery';
import type { EmailNotificationCategory } from '@/shared/types/db.types';

export type {
  EmailDeliveryRunCounts,
  PersistedProviderRequest,
} from '@/shared/notifications/email-delivery';

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  idempotencyKey: string;
};

export type EmailSendResult = {
  providerMessageId: string | null;
};

export type ProviderOutcome = 'rejected' | 'retryable' | 'unknown';

export interface EmailSender {
  resolveRequest(message: EmailMessage): PersistedProviderRequest;
  sendResolved(request: PersistedProviderRequest): Promise<EmailSendResult>;
}

export type EmailDeliveryRunRequest = {
  categories: EmailNotificationCategory[];
  /** UTC calendar date YYYY-MM-DD used for idempotency keys */
  schedulerDateUtc: string;
  batchSize?: number;
  cursorUserId?: string | null;
};

export type EmailDeliveryPageFailure =
  | {
      kind: 'retryable';
      failureClass: string;
      retryAfterMs: number;
    }
  | { kind: 'terminal'; failureClass: string };

export type EmailDeliveryRunResult = EmailDeliveryRunCounts & {
  nextCursor: string | null;
  pageFailure: EmailDeliveryPageFailure | null;
  needsReview: boolean;
};
