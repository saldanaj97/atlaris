/**
 * Returns query-string parameters from a request URL.
 * Use when only search params are needed (not path or origin).
 */
export function getRequestSearchParams(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}
