import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { notImplemented } from '@/lib/api/response';

// GET /api/v1/resources
export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async () => notImplemented())
);
