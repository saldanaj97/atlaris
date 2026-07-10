import { applySignedEmailUnsubscribe } from '@/features/notifications/email/unsubscribe';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { withErrorBoundary } from '@/lib/api/route-wrappers';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'Content-Type': 'text/html; charset=utf-8',
} as const;

function confirmationHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Unsubscribe from Atlaris emails</title>
</head>
<body>
  <main>
    <h1>Unsubscribe from optional Atlaris emails?</h1>
    <p>Confirm below to stop optional email notifications. You can re-enable them later in settings.</p>
    <form method="post">
      <input type="hidden" name="List-Unsubscribe" value="One-Click"/>
      <button type="submit">Unsubscribe</button>
    </form>
  </main>
</body>
</html>`;
}

function successHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Unsubscribed</title>
</head>
<body>
  <main>
    <h1>You're unsubscribed</h1>
    <p>Optional Atlaris email notifications are turned off for this address.</p>
  </main>
</body>
</html>`;
}

function failureHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Unsubscribe unavailable</title>
</head>
<body>
  <main>
    <h1>Unsubscribe link unavailable</h1>
    <p>This unsubscribe link is invalid or expired. You can manage email preferences from your Atlaris settings.</p>
  </main>
</body>
</html>`;
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

async function handleGet(): Promise<Response> {
  // GET is confirmation-only. Never mutate preferences from scanners/prefetchers.
  return htmlResponse(confirmationHtml());
}

async function handlePost(request: Request): Promise<Response> {
  checkIpRateLimit(request, 'emailUnsubscribe');

  const token = new URL(request.url).searchParams.get('token');
  if (!token) {
    return htmlResponse(failureHtml(), 400);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return htmlResponse(failureHtml(), 400);
  }

  const listUnsubscribeValues = form
    .getAll('List-Unsubscribe')
    .filter((value): value is string => typeof value === 'string');

  if (
    listUnsubscribeValues.length !== 1 ||
    listUnsubscribeValues[0] !== 'One-Click'
  ) {
    return htmlResponse(failureHtml(), 400);
  }

  const result = await applySignedEmailUnsubscribe({ token });
  if (!result.ok) {
    return htmlResponse(failureHtml(), 400);
  }

  // RFC 8058: one-click POST must not redirect.
  return htmlResponse(successHtml(), 200);
}

export const GET = withErrorBoundary(handleGet);
export const POST = withErrorBoundary(handlePost);
