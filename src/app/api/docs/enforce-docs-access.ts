import { toErrorResponse } from '@/lib/api/errors';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { appEnv } from '@/lib/config/env';

/** Dev/test gate + docs IP rate limit. Non-null = short-circuit response. */
export function enforceDocsAccess(request: Request): Response | null {
  if (!appEnv.isDevelopment && !appEnv.isTest) {
    return new Response('Not Found', { status: 404 });
  }

  try {
    checkIpRateLimit(request, 'docs');
  } catch (error) {
    return toErrorResponse(error);
  }

  return null;
}
