import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { notImplemented } from '@/lib/api/response';

// POST /api/v1/notifications/weekly-summary
export const POST = withErrorBoundary(
  withAuthAndRateLimit('mutation', async () => notImplemented())
);
