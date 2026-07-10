import type { EmailNotificationCategory } from '@/shared/types/db.types';

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  idempotencyKey: string;
};

/**
 * Fully resolved Resend request snapshot persisted on the delivery ledger.
 * Never includes the API key.
 */
export type PersistedProviderRequest = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  idempotencyKey: string;
};

export type EmailSendResult = {
  providerMessageId: string | null;
};

export type ProviderOutcome = 'rejected' | 'unknown';

export interface EmailSender {
  resolveRequest(message: EmailMessage): PersistedProviderRequest;
  sendResolved(request: PersistedProviderRequest): Promise<EmailSendResult>;
}

export type EmailDeliveryCategory = EmailNotificationCategory;

export type EmailDeliveryRunRequest = {
  categories: EmailDeliveryCategory[];
  /** UTC calendar date YYYY-MM-DD used for idempotency keys */
  schedulerDateUtc: string;
  batchSize?: number;
  cursorUserId?: string | null;
};

export type EmailDeliveryRunCounts = {
  examined: number;
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  alreadyTerminal: number;
  inFlight: number;
  manualReview: number;
};

export type EmailDeliveryRunResult = EmailDeliveryRunCounts & {
  nextCursor: string | null;
};
