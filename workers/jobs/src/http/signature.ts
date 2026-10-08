import {
  computeJobsSignature,
  JOBS_SIGNATURE_HEADER,
  JOBS_SIGNATURE_MAX_SKEW_SECONDS,
  JOBS_SIGNATURE_VERSION,
  JOBS_TIMESTAMP_HEADER,
  jobsSignaturesMatch,
} from '@/lib/jobs-worker/contract';

export type SigningSecrets = {
  JOBS_SIGNING_SECRET?: string;
  /** Accepted alongside the current secret during rotation. */
  JOBS_SIGNING_SECRET_PREVIOUS?: string;
};

export type SignatureVerification =
  | { readonly ok: true; readonly body: string }
  | { readonly ok: false };

const TIMESTAMP_PATTERN = /^\d{1,12}$/;
const SIGNATURE_PATTERN = new RegExp(
  `^${JOBS_SIGNATURE_VERSION}=([0-9a-f]{64})$`,
);

/**
 * Verifies a signed app → Worker command (design note, Decision 4). Consumes
 * the request body and returns it on success so the handler parses the exact
 * bytes that were signed.
 */
export async function verifySignedRequest(
  request: Request,
  secrets: SigningSecrets,
  nowMs: number = Date.now(),
): Promise<SignatureVerification> {
  const candidates = [
    secrets.JOBS_SIGNING_SECRET,
    secrets.JOBS_SIGNING_SECRET_PREVIOUS,
  ].filter((secret): secret is string => Boolean(secret));
  if (candidates.length === 0) {
    return { ok: false };
  }

  const timestamp = request.headers.get(JOBS_TIMESTAMP_HEADER);
  const signature = SIGNATURE_PATTERN.exec(
    request.headers.get(JOBS_SIGNATURE_HEADER) ?? '',
  )?.[1];
  if (!timestamp || !TIMESTAMP_PATTERN.test(timestamp) || !signature) {
    return { ok: false };
  }

  const skewSeconds = Math.abs(nowMs / 1000 - Number(timestamp));
  if (skewSeconds > JOBS_SIGNATURE_MAX_SKEW_SECONDS) {
    return { ok: false };
  }

  const body = await request.text();
  const { pathname } = new URL(request.url);

  let matched = false;
  for (const secret of candidates) {
    const expected = await computeJobsSignature({
      secret,
      timestamp,
      method: request.method,
      path: pathname,
      body,
    });
    // Check every candidate so timing does not reveal which secret matched.
    matched = (await jobsSignaturesMatch(expected, signature)) || matched;
  }

  return matched ? { ok: true, body } : { ok: false };
}

/** Signature failures carry no detail. */
export function unauthorizedResponse(): Response {
  return new Response(null, { status: 401 });
}
