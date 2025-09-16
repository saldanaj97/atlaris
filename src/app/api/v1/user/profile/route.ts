import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { notImplemented } from '@/lib/api/response';

// GET /api/v1/user/profile, PUT /api/v1/user/profile
export const GET = withErrorBoundary(withAuth(async () => notImplemented()));

export const PUT = withErrorBoundary(withAuth(async () => notImplemented()));
