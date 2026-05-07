import { timingSafeEqual } from 'node:crypto';

/**
 * Reads bearer or header token for internal regeneration worker trigger.
 */
export function readWorkerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  return request.headers.get('x-regeneration-worker-token');
}

/**
 * Compares expected secret to provided token using timing-safe equality on
 * min(length) bytes; returns true only when lengths also match (mirrors prior route).
 */
export function tokensMatch(
  expectedToken: string,
  providedToken: string,
): boolean {
  const expected = Buffer.from(expectedToken);
  const provided = Buffer.from(providedToken);

  const lengthMatch = provided.length === expected.length;
  const paddedProvided = lengthMatch
    ? provided
    : provided.length > expected.length
      ? provided.subarray(0, expected.length)
      : Buffer.concat([
          provided,
          Buffer.alloc(expected.length - provided.length),
        ]);
  const matched = timingSafeEqual(expected, paddedProvided);

  return Boolean(Number(lengthMatch) & Number(matched));
}
