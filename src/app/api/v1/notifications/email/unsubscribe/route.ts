import { ROUTES } from '@/features/navigation/routes';
import { applySignedEmailUnsubscribe } from '@/features/notifications/email/unsubscribe';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { withErrorBoundary } from '@/lib/api/route-wrappers';
import { appEnv } from '@/lib/config/env/app';

function settingsRedirect(status: 'unsubscribed' | 'invalid'): Response {
  const base = appEnv.url.replace(/\/$/, '');
  const url = new URL(`${base}${ROUTES.SETTINGS.ROOT}`);
  url.searchParams.set('notifications', status);
  return Response.redirect(url.toString(), 303);
}

async function handleUnsubscribe(request: Request): Promise<Response> {
  checkIpRateLimit(request, 'publicApi');

  let token: string | null = null;
  if (request.method === 'POST') {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await request.formData();
      const formToken = form.get('token');
      token = typeof formToken === 'string' ? formToken : null;
    } else {
      const url = new URL(request.url);
      token = url.searchParams.get('token');
    }
  } else {
    token = new URL(request.url).searchParams.get('token');
  }

  if (!token) {
    return settingsRedirect('invalid');
  }

  const result = await applySignedEmailUnsubscribe({ token });
  return settingsRedirect(result.ok ? 'unsubscribed' : 'invalid');
}

export const GET = withErrorBoundary(handleUnsubscribe);
export const POST = withErrorBoundary(handleUnsubscribe);
