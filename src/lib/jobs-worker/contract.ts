/**
 * App ↔ jobs Worker command contract (docs/architecture/cloudflare-jobs-runtime.md,
 * Decision 4). Shared by the app's signed client and the Worker's verifier, so
 * both sides sign the same canonical string. Web Crypto only: runs on Node and
 * workerd.
 */
import { z } from 'zod';

export const JOBS_TIMESTAMP_HEADER = 'x-atlaris-jobs-timestamp';
export const JOBS_SIGNATURE_HEADER = 'x-atlaris-jobs-signature';
export const JOBS_SIGNATURE_VERSION = 'v1';
/** Commands whose timestamp is further than this from the Worker clock are rejected. */
export const JOBS_SIGNATURE_MAX_SKEW_SECONDS = 300;

export const JOBS_COMMAND_PATHS = {
  regenerationEnqueue: '/v1/regeneration/enqueue',
} as const;

/** `POST /v1/regeneration/enqueue` body; also the regeneration queue message. */
export const regenerationEnqueueCommandSchema = z.object({
  v: z.literal(1),
  jobId: z.uuid(),
});

export type RegenerationEnqueueCommand = z.infer<
  typeof regenerationEnqueueCommandSchema
>;

/** `503` body codes when the Worker refuses a command (Decision 7). */
export type JobsUnavailableCode = 'jobs_paused' | 'job_disabled';

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/**
 * Hex HMAC-SHA256 over `<timestamp>.<METHOD>.<path>.<hex sha256(body)>`.
 * Returns the bare hex digest; the header value is `v1=<hex>`.
 */
export async function computeJobsSignature(input: {
  readonly secret: string;
  readonly timestamp: string;
  readonly method: string;
  readonly path: string;
  readonly body: string;
}): Promise<string> {
  const bodyHash = toHex(
    await crypto.subtle.digest('SHA-256', encoder.encode(input.body)),
  );
  const canonical = `${input.timestamp}.${input.method.toUpperCase()}.${input.path}.${bodyHash}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(input.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(
    await crypto.subtle.sign('HMAC', key, encoder.encode(canonical)),
  );
}

/**
 * Constant-time string compare: both sides are hashed to fixed-length digests
 * first, so length differences cannot short-circuit (same approach as
 * `workflowCallbackTokensMatch`).
 */
export async function jobsSignaturesMatch(
  expected: string,
  provided: string,
): Promise<boolean> {
  const [expectedHash, providedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
  ]);
  const a = new Uint8Array(expectedHash);
  const b = new Uint8Array(providedHash);

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a[index]! ^ b[index]!;
  }
  return mismatch === 0;
}
