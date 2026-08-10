import type { EmailNotificationDeliveryWorkflowInput } from '@/features/notifications/email/workflows/email-notification-delivery.types';

import { createEmailNotificationDeliveryWorkflow } from '@/features/notifications/email/workflows/email-notification-delivery.workflow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const input: EmailNotificationDeliveryWorkflowInput = { runId: 'run-1' };

const workflowMocks = {
  claim: vi.fn(),
  processPage: vi.fn(),
  finalize: vi.fn(),
};

const workflow = createEmailNotificationDeliveryWorkflow(workflowMocks);

describe('emailNotificationDeliveryWorkflow', () => {
  beforeEach(() => {
    workflowMocks.claim.mockReset();
    workflowMocks.processPage.mockReset();
    workflowMocks.finalize.mockReset();
  });

  it('processes every persisted page before one terminal finalization', async () => {
    workflowMocks.claim.mockResolvedValue({ kind: 'claimed' });
    workflowMocks.processPage
      .mockResolvedValueOnce({ kind: 'page_processed', nextCursor: 'user-50' })
      .mockResolvedValueOnce({ kind: 'page_processed', nextCursor: null });
    workflowMocks.finalize.mockResolvedValue({ kind: 'completed' });

    await expect(workflow(input)).resolves.toEqual({ kind: 'completed' });

    expect(workflowMocks.processPage).toHaveBeenCalledTimes(2);
    expect(workflowMocks.finalize).toHaveBeenCalledWith(input);
  });

  it('does not process pages when another workflow already owns the run', async () => {
    workflowMocks.claim.mockResolvedValue({ kind: 'in_flight' });

    await expect(workflow(input)).resolves.toEqual({ kind: 'in_flight' });

    expect(workflowMocks.processPage).not.toHaveBeenCalled();
    expect(workflowMocks.finalize).not.toHaveBeenCalled();
  });
});
