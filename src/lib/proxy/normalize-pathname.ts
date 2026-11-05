/**
 * The path the proxy policy functions compare against. Decodes once, like Next
 * does for route params, so an encoded segment (`/%64ashboard`) cannot differ
 * from the routed one (DEV-208).
 *
 * Returns null, and the proxy answers 400, when the path is not valid
 * percent-encoding or when decoding reveals a `.` or `..` segment. The URL
 * parser already removes literal dot segments before the proxy runs, so one
 * that appears only after decoding came from `%2e` or `%2f` and would make the
 * policy path (`/api/internal/../../dashboard` is internal-exempt) differ from
 * any route a decoding router would pick.
 */
export function normalizeProxyPathname(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const hasDotSegment = decoded
    .split('/')
    .some((segment) => segment === '.' || segment === '..');
  return hasDotSegment ? null : decoded;
}
