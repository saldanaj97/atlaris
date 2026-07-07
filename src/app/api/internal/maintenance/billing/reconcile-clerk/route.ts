import { reconcileClerkBillingEntitlements } from '@/features/billing/clerk-billing/reconciliation';
import { createMaintenancePostRoute } from '@/lib/api/internal/maintenance-route';
import { json } from '@/lib/api/response';
import { maintenanceEnv } from '@/lib/config/env';

function parsePositiveInteger(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export const POST = createMaintenancePostRoute({
  enabled: () => maintenanceEnv.clerkBillingReconciliationEnabled,
  unavailableMessage: 'Clerk Billing reconciliation is currently unavailable.',
  unauthorizedLogMessage:
    'Unauthorized Clerk Billing reconciliation trigger attempt',
  run: async ({ logger, request }) => {
    logger.info('Starting Clerk Billing reconciliation');

    const url = new URL(request.url);
    const result = await reconcileClerkBillingEntitlements({
      logger,
      limit: parsePositiveInteger(url.searchParams.get('limit')),
      startingAfterAuthUserId:
        url.searchParams.get('cursor')?.trim() || undefined,
    });

    logger.info({ result }, 'Completed Clerk Billing reconciliation');

    return json({ ok: true, ...result });
  },
});
