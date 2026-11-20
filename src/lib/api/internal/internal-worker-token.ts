import { timingSafeEqual } from 'node:crypto';

export function readInternalWorkerToken(
  request: Request,
  headerName: string,
): string | null {
  if (!headerName.trim()) {
    return null;
  }

  const authHeader = request.headers.get('authorization');
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  const bearerToken = bearerMatch?.[1]?.trim() ?? null;
  const customToken = request.headers.get(headerName);

  if (bearerToken && customToken) {
    return null;
  }

  if (bearerToken) {
    return bearerToken;
  }

  return customToken;
}

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
