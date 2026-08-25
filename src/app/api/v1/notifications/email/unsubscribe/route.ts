import { applySignedEmailUnsubscribe } from '@/features/notifications/email/unsubscribe';
import { checkIpRateLimit } from '@/lib/api/ip-rate-limit';
import { withErrorBoundary } from '@/lib/api/route-wrappers';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'Content-Type': 'text/html; charset=utf-8',
} as const;

const ONE_CLICK_MAX_BYTES = 64 * 1024;
const ONE_CLICK_MEDIA_TYPES = new Set([
  'application/x-www-form-urlencoded',
  'multipart/form-data',
]);

function htmlPage(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title}</title>
</head>
<body>
  <main>
    ${content}
  </main>
</body>
</html>`;
}

function confirmationHtml(): string {
  return htmlPage(
    'Unsubscribe from Atlaris emails',
    `<h1>Unsubscribe from optional Atlaris emails?</h1>
    <p>Confirm below to stop optional email notifications. You can re-enable them later in settings.</p>
    <form method="post">
      <input type="hidden" name="List-Unsubscribe" value="One-Click"/>
      <button type="submit">Unsubscribe</button>
    </form>`,
  );
}

function successHtml(): string {
  return htmlPage(
    'Unsubscribed',
    `<h1>You're unsubscribed</h1>
    <p>Optional Atlaris email notifications are turned off for this address.</p>
`,
  );
}

function failureHtml(): string {
  return htmlPage(
    'Unsubscribe unavailable',
    `<h1>Unsubscribe link unavailable</h1>
    <p>This unsubscribe link is invalid or expired. You can manage email preferences from your Atlaris settings.</p>
`,
  );
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

function mediaType(request: Request): string | null {
  const contentType = request.headers.get('content-type');
  if (!contentType) return null;
  return contentType.split(';', 1)[0]?.trim().toLowerCase() || null;
}

async function readBodyCapped(request: Request): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    length += value.byteLength;
    if (length > ONE_CLICK_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function parseOneClickForm(
  request: Request,
): Promise<{ form: FormData } | { status: 400 | 413 | 415 }> {
  const contentType = request.headers.get('content-type');
  if (!contentType || !ONE_CLICK_MEDIA_TYPES.has(mediaType(request) ?? '')) {
    return { status: 415 };
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > ONE_CLICK_MAX_BYTES) {
    return { status: 413 };
  }

  const body = await readBodyCapped(request);
  if (body === null) return { status: 413 };
  const parsedBody = new ArrayBuffer(body.byteLength);
  new Uint8Array(parsedBody).set(body);

  try {
    const form = await new Request(request.url, {
      method: request.method,
      headers: { 'content-type': contentType },
      body: parsedBody,
    }).formData();
    return { form };
  } catch {
    return { status: 400 };
  }
}

export const GET = withErrorBoundary(async () => {
  // GET is confirmation-only. Never mutate preferences from scanners/prefetchers.
  return htmlResponse(confirmationHtml());
});

async function handlePost(request: Request): Promise<Response> {
  checkIpRateLimit(request, 'publicApi');

  const token = new URL(request.url).searchParams.get('token');
  if (!token) {
    return htmlResponse(failureHtml(), 400);
  }

  const parsed = await parseOneClickForm(request);
  if ('status' in parsed) {
    return htmlResponse(failureHtml(), parsed.status);
  }

  const entries = [...parsed.form.entries()];
  if (
    entries.length !== 1 ||
    entries[0]?.[0] !== 'List-Unsubscribe' ||
    entries[0][1] !== 'One-Click'
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

export const POST = withErrorBoundary(handlePost);
