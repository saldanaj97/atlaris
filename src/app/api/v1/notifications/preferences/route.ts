import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { notImplemented } from '@/lib/api/response';

// GET/PUT /api/v1/notifications/preferences
export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async () => notImplemented())
);
export const PUT = withErrorBoundary(
  withAuthAndRateLimit('mutation', async () => notImplemented())
);
