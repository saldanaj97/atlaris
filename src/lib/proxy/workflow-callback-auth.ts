export const WORKFLOW_CALLBACK_TOKEN_HEADER = 'x-workflow-callback-token';

export type WorkflowCallbackAuthConfig = {
  readonly isProduction: boolean;
  readonly isHostedVercelDeploy: boolean;
  readonly callbackToken: string | undefined;
  readonly headerName?: string;
};

export type WorkflowCallbackAuthInput = {
  readonly method: string;
  readonly pathname: string;
  readonly searchParams: URLSearchParams;
  readonly headers: Headers;
};

export type WorkflowCallbackAuthResult =
  | { readonly status: 'allow' }
  | { readonly status: 'deny' }
  | { readonly status: 'misconfigured' };

export function isWorkflowCallbackPath(pathname: string): boolean {
  return pathname.startsWith('/.well-known/workflow/');
}

export function isWorkflowWebhookPath(pathname: string): boolean {
  return pathname.startsWith('/.well-known/workflow/v1/webhook/');
}

export function isWorkflowHealthCheck(input: {
  method: string;
  searchParams: URLSearchParams;
}): boolean {
  if (!input.searchParams.has('__health')) {
    return false;
  }

  return ['HEAD', 'GET', 'OPTIONS'].includes(input.method.toUpperCase());
}

export function hasLocalWorldQueueHeaders(headers: Headers): boolean {
  return (
    headers.has('x-vqs-queue-name') &&
    headers.has('x-vqs-message-id') &&
    headers.has('x-vqs-message-attempt')
  );
}

/**
 * Reads bearer or custom header token for workflow callback routes.
 * Returns null when both are supplied or neither is present.
 */
export function readWorkflowCallbackToken(
  headers: Headers,
  headerName: string = WORKFLOW_CALLBACK_TOKEN_HEADER,
): string | null {
  if (!headerName.trim()) {
    return null;
  }

  const authHeader = headers.get('authorization');
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  const bearerToken = bearerMatch?.[1]?.trim() ?? null;
  const customToken = headers.get(headerName)?.trim() ?? null;

  if (bearerToken && customToken) {
    return null;
  }

  if (bearerToken) {
    return bearerToken;
  }

  return customToken === '' ? null : customToken;
}

/**
 * Edge-safe timing-safe string compare for shared-secret tokens.
 * Uses fixed-length SHA-256 digests so token length cannot short-circuit compare.
 */
export async function workflowCallbackTokensMatch(
  expectedToken: string,
  providedToken: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const [expectedHash, providedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(expectedToken)),
    crypto.subtle.digest('SHA-256', encoder.encode(providedToken)),
  ]);
  const expected = new Uint8Array(expectedHash);
  const provided = new Uint8Array(providedHash);

  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected[index]! ^ provided[index]!;
  }

  return mismatch === 0;
}

export async function resolveWorkflowCallbackAccess(
  input: WorkflowCallbackAuthInput,
  config: WorkflowCallbackAuthConfig,
): Promise<WorkflowCallbackAuthResult> {
  if (!isWorkflowCallbackPath(input.pathname)) {
    return { status: 'allow' };
  }

  if (isWorkflowHealthCheck(input) && !config.isProduction) {
    return { status: 'allow' };
  }

  if (isWorkflowWebhookPath(input.pathname)) {
    return { status: 'allow' };
  }

  if (config.isHostedVercelDeploy) {
    return { status: 'allow' };
  }

  const headerName = config.headerName ?? WORKFLOW_CALLBACK_TOKEN_HEADER;

  if (config.callbackToken) {
    const providedToken = readWorkflowCallbackToken(input.headers, headerName);
    if (
      providedToken &&
      (await workflowCallbackTokensMatch(config.callbackToken, providedToken))
    ) {
      return { status: 'allow' };
    }

    return { status: 'deny' };
  }

  if (config.isProduction) {
    return { status: 'misconfigured' };
  }

  if (hasLocalWorldQueueHeaders(input.headers)) {
    return { status: 'allow' };
  }

  return { status: 'deny' };
}
