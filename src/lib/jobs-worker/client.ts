import {
  computeJobsSignature,
  JOBS_SIGNATURE_HEADER,
  JOBS_SIGNATURE_VERSION,
  JOBS_TIMESTAMP_HEADER,
} from '@/lib/jobs-worker/contract';

/** Decision 4: one attempt, 10 seconds, no automatic retry. */
export const JOBS_WORKER_TIMEOUT_MS = 10_000;

export type JobsWorkerClientConfig = {
  readonly url: string | undefined;
  readonly signingSecret: string | undefined;
};

export type JobsWorkerCommandResult =
  /** 2xx; `body` is the parsed JSON response, or null when it is not JSON. */
  | {
      readonly kind: 'accepted';
      readonly status: number;
      readonly body: unknown;
    }
  /** Non-2xx; `code` is the Worker's `code` field when present (e.g. `jobs_paused`). */
  | {
      readonly kind: 'rejected';
      readonly status: number;
      readonly code: string | undefined;
    }
  | {
      readonly kind: 'unavailable';
      readonly reason: 'not_configured' | 'timeout' | 'network';
    };

export type JobsWorkerClientDeps = {
  readonly config: JobsWorkerClientConfig;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly timeoutMs?: number;
};

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readCode(body: unknown): string | undefined {
  if (typeof body === 'object' && body !== null && 'code' in body) {
    return typeof body.code === 'string' ? body.code : undefined;
  }
  return undefined;
}

/**
 * Sends `POST {JOBS_WORKER_URL}<path>` with the HMAC headers from the shared
 * contract. Never throws for transport or HTTP failures; callers branch on the
 * result kind.
 */
export async function sendJobsWorkerCommand(
  path: `/v1/${string}`,
  payload: Record<string, unknown>,
  deps: JobsWorkerClientDeps,
): Promise<JobsWorkerCommandResult> {
  const { url, signingSecret } = deps.config;
  if (!url || !signingSecret) {
    return { kind: 'unavailable', reason: 'not_configured' };
  }

  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor((deps.now ?? Date.now)() / 1000));
  const signature = await computeJobsSignature({
    secret: signingSecret,
    timestamp,
    method: 'POST',
    path,
    body,
  });

  let response: Response;
  try {
    response = await (deps.fetch ?? fetch)(new URL(path, url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [JOBS_TIMESTAMP_HEADER]: timestamp,
        [JOBS_SIGNATURE_HEADER]: `${JOBS_SIGNATURE_VERSION}=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(deps.timeoutMs ?? JOBS_WORKER_TIMEOUT_MS),
    });
  } catch (error) {
    // DOMException is not an `Error` instance in every runtime; match by name.
    const name =
      typeof error === 'object' && error !== null && 'name' in error
        ? error.name
        : undefined;
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    return { kind: 'unavailable', reason: timedOut ? 'timeout' : 'network' };
  }

  const responseBody = await readJson(response);
  if (response.ok) {
    return { kind: 'accepted', status: response.status, body: responseBody };
  }
  return {
    kind: 'rejected',
    status: response.status,
    code: readCode(responseBody),
  };
}
