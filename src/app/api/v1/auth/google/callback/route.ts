import { withErrorBoundary } from '@/lib/api/auth';
import { notImplemented } from '@/lib/api/response';

// GET /api/v1/auth/google/callback (No auth wrapper)
export const GET = withErrorBoundary(async () => notImplemented());
