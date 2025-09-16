import { withErrorBoundary } from '@/lib/api/auth';
import { notImplemented } from '@/lib/api/response';

// POST /api/v1/stripe/webhook (No auth wrapper)
export const POST = withErrorBoundary(async () => notImplemented());
