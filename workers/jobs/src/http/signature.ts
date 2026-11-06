import { readBodyTextCapped } from './body';
import {
  computeJobsSignatureFromBodyHash,
  hashJobsBody,
  JOBS_SIGNATURE_HEADER,
  JOBS_SIGNATURE_MAX_SKEW_SECONDS,
  JOBS_SIGNATURE_VERSION,
  JOBS_SIGNED_BODY_MAX_BYTES,
  JOBS_TIMESTAMP_HEADER,
  jobsSignaturesMatch,
} from '@/lib/jobs-worker/contract';

export type SigningSecrets = {
  JOBS_SIGNING_SECRET?: string;
  /** Accepted alongside the current secret during rotation. */
  JOBS_SIGNING_SECRET_PREVIOUS?: string;
};

export type SignatureFailure = {
  readonly ok: false;
  readonly reason: 'unauthorized' | 'body_too_large';
};

export type SignatureVerification =
  | { readonly ok: true; readonly body: string }
  | SignatureFailure;

const UNAUTHORIZED: SignatureFailure = { ok: false, reason: 'unauthorized' };
const BODY_TOO_LARGE: SignatureFailure = {
  ok: false,
  reason: 'body_too_large',
};

const TIMESTAMP_PATTERN = /^\d{1,12}$/;
const SIGNATURE_PATTERN = new RegExp(
  `^${JOBS_SIGNATURE_VERSION}=([0-9a-f]{64})$`,
);

function declaredContentLength(request: Request): number | null {
  const header = request.headers.get('content-length');
  if (header === null || header.trim() === '') return null;
  const length = Number(header);
  return Number.isFinite(length) ? length : null;
}

/**
 * Verifies a signed app → Worker command (design note, Decision 4). Consumes
 * the request body and returns it on success so the handler parses the exact
 * bytes that were signed. Bodies over {@link JOBS_SIGNED_BODY_MAX_BYTES} are
 * rejected unread or as soon as the stream passes the cap (DEV-208, lead 5).
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
    return UNAUTHORIZED;
  }

  const timestamp = request.headers.get(JOBS_TIMESTAMP_HEADER);
  const signature = SIGNATURE_PATTERN.exec(
    request.headers.get(JOBS_SIGNATURE_HEADER) ?? '',
  )?.[1];
  if (!timestamp || !TIMESTAMP_PATTERN.test(timestamp) || !signature) {
    return UNAUTHORIZED;
  }

  const skewSeconds = Math.abs(nowMs / 1000 - Number(timestamp));
  if (skewSeconds > JOBS_SIGNATURE_MAX_SKEW_SECONDS) {
    return UNAUTHORIZED;
  }

  const declared = declaredContentLength(request);
  if (declared !== null && declared > JOBS_SIGNED_BODY_MAX_BYTES) {
    return BODY_TOO_LARGE;
  }
  const body = await readBodyTextCapped(request, JOBS_SIGNED_BODY_MAX_BYTES);
  if (body === null) {
    return BODY_TOO_LARGE;
  }
  const { pathname } = new URL(request.url);
  const bodyHash = await hashJobsBody(body);

  let matched = false;
  for (const secret of candidates) {
    const expected = await computeJobsSignatureFromBodyHash({
      secret,
      timestamp,
      method: request.method,
      path: pathname,
      bodyHash,
    });
    // Check every candidate so timing does not reveal which secret matched.
    matched = (await jobsSignaturesMatch(expected, signature)) || matched;
  }

  return matched ? { ok: true, body } : UNAUTHORIZED;
}

/** Signature failures carry no detail. */
export function unauthorizedResponse(): Response {
  return new Response(null, { status: 401 });
}

/** `413` for an oversized body, otherwise the detail-free `401`. */
export function signatureFailureResponse(failure: SignatureFailure): Response {
  return failure.reason === 'body_too_large'
    ? new Response(null, { status: 413 })
    : unauthorizedResponse();
}
