import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { notImplemented } from '@/lib/api/response';

// POST /api/v1/integrations/disconnect
export const POST = withErrorBoundary(withAuth(async () => notImplemented()));
