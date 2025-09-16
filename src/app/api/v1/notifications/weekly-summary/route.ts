import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { notImplemented } from '@/lib/api/response';

// POST /api/v1/notifications/weekly-summary
export const POST = withErrorBoundary(withAuth(async () => notImplemented()));
