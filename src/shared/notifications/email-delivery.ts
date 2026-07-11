/**
 * Fully resolved provider request snapshot persisted on the delivery ledger.
 * Never includes provider credentials.
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

export type EmailDeliveryRunCounts = {
  examined: number;
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  alreadyTerminal: number;
  inFlight: number;
  manualReview: number;
  recipientErrors: number;
};
