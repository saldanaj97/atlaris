import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { notImplemented } from '@/lib/api/response';

// GET/PUT /api/v1/notifications/preferences
export const GET = withErrorBoundary(withAuth(async () => notImplemented()));
export const PUT = withErrorBoundary(withAuth(async () => notImplemented()));
